"use strict";

const assert = require("assert");

const {
    normalizeConsoleCommandText,
    normalizeConsoleLineEndings
} = require("../../shared/console/commandText");

const commandWithNonBreakingSpace =
    'load("Lucru/Persoane/Sergiu\u00A0Buscaneanu/Analiza.rda")';

assert.strictEqual(
    normalizeConsoleLineEndings("a\r\nb\rc"),
    "a\nb\nc",
    "console line ending normalization must preserve existing behavior"
);

assert.strictEqual(
    normalizeConsoleCommandText(commandWithNonBreakingSpace),
    'load("Lucru/Persoane/Sergiu Buscaneanu/Analiza.rda")',
    "console command text must convert pasted non-breaking spaces to normal spaces"
);

assert.strictEqual(
    normalizeConsoleCommandText("x <- 'a\u202Fb'\ny <- 'c\u3000d'"),
    "x <- 'a b'\ny <- 'c d'",
    "console command text must normalize copied Unicode space separators"
);

assert.strictEqual(
    normalizeConsoleCommandText('ess\u200B<-\u2060readRDS("~/ess9ro.rds")'),
    'ess <- readRDS("~/ess9ro.rds")',
    "console command text must normalize zero-width copied space characters"
);

assert.strictEqual(
    normalizeConsoleCommandText('install.packages("QCA", repos = "cran.r-project.org")'),
    'install.packages("QCA", repos = "https://cran.r-project.org")',
    "console command text must preserve package repository normalization"
);

console.log("Console command text normalization verified.");
