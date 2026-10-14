package com.bridgit.api.account;

import com.bridgit.api.auth.AuthDtos;
import com.bridgit.api.common.api.ApiEnvelope;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/account")
public class AccountController {

  private final AccountService accountService;

  public AccountController(AccountService accountService) {
    this.accountService = accountService;
  }

  @PatchMapping
  public ApiEnvelope<AuthDtos.SessionResponse> updateAccount(@Valid @RequestBody UpdateAccountRequest request) {
    return ApiEnvelope.ok(accountService.updateUsername(request.username()));
  }

  @PostMapping("/password")
  public ApiEnvelope<AuthDtos.MessageResponse> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
    return ApiEnvelope.ok(accountService.changePassword(request.currentPassword(), request.newPassword()));
  }

  @DeleteMapping
  public ApiEnvelope<AuthDtos.MessageResponse> deleteAccount(@Valid @RequestBody DeleteAccountRequest request) {
    return ApiEnvelope.ok(accountService.deleteAccount(request.password()));
  }

  public record UpdateAccountRequest(
      @NotBlank(message = "O usuário é obrigatório.")
      @Size(min = 3, max = 32, message = "O usuário deve ter entre 3 e 32 caracteres.")
      @Pattern(regexp = "^[A-Za-z0-9._-]+$", message = "O usuário deve usar apenas letras, números, ponto, hífen ou sublinhado.")
      String username
  ) {
  }

  public record DeleteAccountRequest(
      @NotBlank(message = "A senha é obrigatória.") String password
  ) {
  }

  public record ChangePasswordRequest(
      @NotBlank(message = "A senha atual é obrigatória.") String currentPassword,
      @NotBlank(message = "A nova senha é obrigatória.")
      @Size(min = 8, message = "A senha deve ter pelo menos 8 caracteres.")
      String newPassword
  ) {
  }
}
