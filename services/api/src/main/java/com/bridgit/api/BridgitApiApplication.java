package com.bridgit.api;

import com.bridgit.api.config.DatasourceSafetyGuard;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;

@SpringBootApplication
public class BridgitApiApplication {

  public static void main(String[] args) {
    SpringApplication application = new SpringApplication(BridgitApiApplication.class);
    application.addListeners((ApplicationEnvironmentPreparedEvent event) ->
        DatasourceSafetyGuard.validate(event.getEnvironment()));
    application.run(args);
  }
}
