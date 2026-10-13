package com.bridgit.api.operations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.bridgit.api.common.error.BadRequestException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class OperationsControllerRequestTest {

  private final ObjectMapper json = new ObjectMapper();

  @Test
  void readsTheUploadRequestSentAsAPlainFormField() {
    OperationDtos.Request request = OperationsController.readRequest(json,
        "{\"clientKey\":\"k1\",\"provider\":\"onedrive\",\"kind\":\"UPLOAD\",\"parentRef\":\"\",\"name\":\"Relatório.pdf\"}");

    assertEquals("k1", request.clientKey());
    assertEquals(OperationDtos.Kind.UPLOAD, request.kind());
    assertEquals("Relatório.pdf", request.name());
  }

  @Test
  void rejectsMalformedOrEmptyRequestsAsBadRequest() {
    assertThrows(BadRequestException.class, () -> OperationsController.readRequest(json, "{not json"));
    assertThrows(BadRequestException.class, () -> OperationsController.readRequest(json, "null"));
  }
}
