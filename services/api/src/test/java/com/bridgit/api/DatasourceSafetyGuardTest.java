package com.bridgit.api;

import com.bridgit.api.config.DatasourceSafetyGuard;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DatasourceSafetyGuardTest {

  @Test
  void shouldAllowOfficialApplicationDatabaseOutsideTestProfile() {
    MockEnvironment environment = new MockEnvironment()
        .withProperty("spring.datasource.url", "jdbc:sqlserver://localhost:1433;databaseName=bridgit_db;encrypt=false");

    assertDoesNotThrow(() -> DatasourceSafetyGuard.validate(environment));
  }

  @Test
  void shouldBlockInvalidDatabaseOutsideTestProfile() {
    MockEnvironment environment = new MockEnvironment()
        .withProperty("spring.datasource.url", "jdbc:sqlserver://localhost:1433;databaseName=plan_things_db;encrypt=false");

    IllegalStateException exception = assertThrows(IllegalStateException.class,
        () -> DatasourceSafetyGuard.validate(environment));

    assertEquals(
        "Inicializacao bloqueada: fora do profile de teste, o backend deve usar exclusivamente a base 'bridgit_db'. Base recebida: 'plan_things_db'.",
        exception.getMessage()
    );
  }

  @Test
  void shouldBlockWhenDatabaseNameIsMissingOutsideTestProfile() {
    MockEnvironment environment = new MockEnvironment()
        .withProperty("spring.datasource.url", "jdbc:sqlserver://localhost:1433;encrypt=false");

    IllegalStateException exception = assertThrows(IllegalStateException.class,
        () -> DatasourceSafetyGuard.validate(environment));

    assertEquals(
        "Inicializacao bloqueada: fora do profile de teste, o datasource deve informar o parametro 'databaseName' e usar exclusivamente a base oficial da aplicacao.",
        exception.getMessage()
    );
  }

  @Test
  void shouldAllowAnyDatabaseDuringTestProfile() {
    MockEnvironment environment = new MockEnvironment()
        .withProperty("spring.datasource.url", "jdbc:sqlserver://localhost:1433;databaseName=bridgit_test;encrypt=false");
    environment.setActiveProfiles("test");

    assertDoesNotThrow(() -> DatasourceSafetyGuard.validate(environment));
  }

  @Test
  void shouldExtractDatabaseNameFromSqlServerUrl() {
    assertEquals(
        "bridgit_db",
        DatasourceSafetyGuard.extractDatabaseName("jdbc:sqlserver://localhost:1433;databaseName=bridgit_db;encrypt=false")
    );
  }
}
