package com.bridgit.api.operations;

import com.bridgit.api.catalog.LocalHubProperties;
import com.bridgit.api.common.error.ApiException;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.core.io.InputStreamSource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class UploadPayloadStore {
  private final Path root;
  public UploadPayloadStore(LocalHubProperties properties) { root = Path.of(properties.getUploadDirectory()).toAbsolutePath().normalize(); }
  public OperationStore.Payload receive(InputStreamSource source, long expected) {
    if (expected < 0 || expected > 50L * 1024 * 1024) throw failure("ARQUIVO_GRANDE", "O arquivo excede o limite de 50 MB.");
    Path partial = root.resolve(UUID.randomUUID() + ".partial");
    Path ready = root.resolve(UUID.randomUUID() + ".upload");
    try {
      Files.createDirectories(root);
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      long size = 0;
      try (InputStream in = source.getInputStream(); FileChannel out = FileChannel.open(partial, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
        byte[] bytes = new byte[64 * 1024];
        int count;
        while ((count = in.read(bytes)) != -1) {
          size += count;
          if (size > expected) throw failure("UPLOAD_INVALIDO", "O tamanho do arquivo mudou durante o envio.");
          digest.update(bytes, 0, count);
          ByteBuffer buffer = ByteBuffer.wrap(bytes, 0, count);
          while (buffer.hasRemaining()) out.write(buffer);
        }
        if (size != expected) throw failure("UPLOAD_INCOMPLETO", "O arquivo nao foi recebido completamente.");
        out.force(true);
      }
      Files.move(partial, ready, StandardCopyOption.ATOMIC_MOVE);
      return new OperationStore.Payload(ready.getFileName().toString(), size, HexFormat.of().formatHex(digest.digest()));
    } catch (ApiException ex) { throw ex; }
    catch (Exception ex) { throw failure("UPLOAD_ARMAZENAMENTO", "Nao foi possivel guardar o arquivo para envio. Tente novamente."); }
    finally { try { Files.deleteIfExists(partial); } catch (IOException ignored) {} }
  }
  public InputStreamSource verified(OperationStore.Payload payload) {
    if (payload == null) throw failure("UPLOAD_AUSENTE", "Selecione o arquivo novamente.");
    Path file = resolve(payload.path());
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      try (InputStream in = Files.newInputStream(file)) {
        byte[] bytes = new byte[64 * 1024]; int read;
        while ((read = in.read(bytes)) != -1) digest.update(bytes, 0, read);
      }
      if (Files.size(file) != payload.size() || !HexFormat.of().formatHex(digest.digest()).equals(payload.hash())) throw new IOException("Payload integrity mismatch");
      return () -> Files.newInputStream(file);
    } catch (Exception ex) { throw failure("UPLOAD_AUSENTE", "O arquivo temporario nao esta disponivel. Selecione-o novamente."); }
  }
  public void remove(OperationStore.Payload payload) {
    if (payload == null) return;
    try { Files.deleteIfExists(resolve(payload.path())); }
    catch (IOException ex) { throw new IllegalStateException("Cannot remove completed upload", ex); }
  }
  private Path resolve(String name) {
    Path result = root.resolve(name).normalize();
    if (!result.getParent().equals(root)) throw new IllegalArgumentException("Invalid payload path");
    return result;
  }
  private static ApiException failure(String code, String message) { return new ApiException(HttpStatus.BAD_REQUEST, code, message); }
}
