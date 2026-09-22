package com.bridgit.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.MSSQLServerContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
@Sql(scripts = "/sql/cleanup.sql", executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
public abstract class ApiIntegrationTestSupport {

  @Container
  static final MSSQLServerContainer<?> SQL_SERVER = new MSSQLServerContainer<>("mcr.microsoft.com/mssql/server:2022-latest")
      .acceptLicense();

  @Autowired
  protected MockMvc mockMvc;

  @Autowired
  protected ObjectMapper objectMapper;

  @DynamicPropertySource
  static void registerTestDatabaseProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", SQL_SERVER::getJdbcUrl);
    registry.add("spring.datasource.username", SQL_SERVER::getUsername);
    registry.add("spring.datasource.password", SQL_SERVER::getPassword);
  }

  protected JsonNode registerUser(String username, String password, UUID deviceKey) throws Exception {
    return readJson(mockMvc.perform(post("/api/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                  "username": "%s",
                  "password": "%s",
                  "deviceKey": "%s"
                }
                """.formatted(username, password, deviceKey)))
        .andExpect(status().isOk())
        .andReturn());
  }

  protected JsonNode loginUser(String username, String password, UUID deviceKey) throws Exception {
    return readJson(mockMvc.perform(post("/api/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                  "username": "%s",
                  "password": "%s",
                  "deviceKey": "%s"
                }
                """.formatted(username, password, deviceKey)))
        .andExpect(status().isOk())
        .andReturn());
  }

  protected JsonNode readJson(MvcResult result) throws Exception {
    return objectMapper.readTree(result.getResponse().getContentAsString());
  }
}
