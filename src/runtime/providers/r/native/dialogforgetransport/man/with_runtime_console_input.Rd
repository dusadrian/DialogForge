\name{with_runtime_console_input}
\alias{with_runtime_console_input}
\title{Evaluate with a scoped runtime console input owner}
\usage{with_runtime_console_input(evaluate, read_reply)}
\arguments{
    \item{evaluate}{A zero-argument function to evaluate.}
    \item{read_reply}{A function accepting the physical console prompt and returning one reply.}
}
\description{Routes raw R console reads through the calling runtime's shared
prompt owner for one evaluation. Restores the previous frontend on normal return,
error and interruption. The callback owns prompt identity, delivery and replies;
the native routine only supplies the console buffer and scopes frontend access.}
\value{The evaluation function's result.}
