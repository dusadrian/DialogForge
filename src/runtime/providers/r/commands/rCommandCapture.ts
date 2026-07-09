export const buildRSourceVisibleCommand = function(code: unknown): string {
    return [
        ".DialogForgeWebConnection <- textConnection(",
        JSON.stringify(String(code || "")),
        ")",
        "tryCatch(",
        "  source(.DialogForgeWebConnection, local = .GlobalEnv, echo = FALSE, print.eval = TRUE),",
        "  finally = close(.DialogForgeWebConnection)",
        ")"
    ].join("\n");
};

export const buildRCapturedVisibleCommand = function(
    code: unknown,
    width = 120
): string {
    return [
        "local({",
        "  .DialogForgeWebOldWidth <- getOption(\"width\")",
        `  options(width = ${width})`,
        "  on.exit(options(width = .DialogForgeWebOldWidth), add = TRUE)",
        `  .DialogForgeWebExpressions <- parse(text = ${JSON.stringify(String(code || ""))})`,
        "  for (.DialogForgeWebExpression in .DialogForgeWebExpressions) {",
        "    withCallingHandlers({",
        "      .DialogForgeWebValue <- withVisible(eval(.DialogForgeWebExpression, envir = .GlobalEnv))",
        "      if (isTRUE(.DialogForgeWebValue$visible)) {",
        "        print(.DialogForgeWebValue$value)",
        "      }",
        "    }, message = function(.DialogForgeWebMessage) {",
        "      cat(conditionMessage(.DialogForgeWebMessage), sep = \"\\n\")",
        "      invokeRestart(\"muffleMessage\")",
        "    }, warning = function(.DialogForgeWebWarning) {",
        "      cat(paste0(\"Warning: \", conditionMessage(.DialogForgeWebWarning)), \"\\n\", sep = \"\", file = stderr())",
        "      invokeRestart(\"muffleWarning\")",
        "    })",
        "  }",
        "  invisible(NULL)",
        "})"
    ].join("\n");
};

export const buildRCapturedTextCommand = function(
    code: unknown,
    width = 120
): string {
    return [
        "local({",
        "  .DialogForgeWebOldWidth <- getOption(\"width\")",
        `  options(width = ${width})`,
        "  on.exit(options(width = .DialogForgeWebOldWidth), add = TRUE)",
        `  .DialogForgeWebExpressions <- parse(text = ${JSON.stringify(String(code || ""))})`,
        "  .DialogForgeWebOutput <- capture.output({",
        "    for (.DialogForgeWebExpression in .DialogForgeWebExpressions) {",
        "      withCallingHandlers({",
        "        .DialogForgeWebValue <- withVisible(eval(.DialogForgeWebExpression, envir = .GlobalEnv))",
        "        if (isTRUE(.DialogForgeWebValue$visible)) {",
        "          print(.DialogForgeWebValue$value)",
        "        }",
        "      }, message = function(.DialogForgeWebMessage) {",
        "        cat(conditionMessage(.DialogForgeWebMessage), sep = \"\\n\")",
        "        invokeRestart(\"muffleMessage\")",
        "      }, warning = function(.DialogForgeWebWarning) {",
        "        cat(paste0(\"Warning: \", conditionMessage(.DialogForgeWebWarning)), \"\\n\", sep = \"\")",
        "        invokeRestart(\"muffleWarning\")",
        "      })",
        "    }",
        "  }, type = \"output\")",
        "  paste(.DialogForgeWebOutput, collapse = \"\\n\")",
        "})"
    ].join("\n");
};
