package com.bridgit.api.account;

import com.bridgit.api.auth.AuthDtos;
import com.bridgit.api.common.api.ApiEnvelope;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
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

  @GetMapping
  public ApiEnvelope<AuthDtos.AccountResponse> getAccount() {
    return ApiEnvelope.ok(accountService.getAccount());
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
  public ApiEnvelope<AuthDtos.MessageResponse> deleteAccount() {
    return ApiEnvelope.ok(accountService.deleteAccount());
  }

  public record UpdateAccountRequest(
      @NotBlank(message = "O usuario e obrigatorio.")
      @Size(min = 3, max = 32, message = "O usuario deve ter entre 3 e 32 caracteres.")
      @Pattern(regexp = "^[A-Za-z0-9._-]+$", message = "O usuario deve usar apenas letras, numeros, ponto, hifen ou sublinhado.")
      String username
  ) {
  }

  public record ChangePasswordRequest(
      @NotBlank(message = "A senha atual e obrigatoria.") String currentPassword,
      @NotBlank(message = "A nova senha e obrigatoria.")
      @Size(min = 8, message = "A senha deve ter pelo menos 8 caracteres.")
      String newPassword
  ) {
  }
}
