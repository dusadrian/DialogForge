\name{open_message_output}
\alias{open_message_output}
\title{Forward Message Output Through a Runtime-Owned Selector}
\usage{
open_message_output(stdout, stderr, selector)
}
\arguments{
    \item{stdout}{An open writable connection for ordinary message output.}
    \item{stderr}{An open writable connection for other standard-error output.}
    \item{selector}{A function returning one non-missing logical value for each
        write. A true value chooses \code{stdout}; false chooses \code{stderr}.}
}
\description{
Creates a write-only proxy connection. The runtime owns condition observation,
selection policy, sink installation, and restoration. The connection forwards
the original emitted bytes without changing message formatting or line endings.
}
\value{
A connection. Closing the proxy does not close either destination.
}
\details{
Destinations must be explicit file, raw, text, or custom connections. The
special console connections numbered zero through two are rejected because
their R output routing can return to the active sink. Callers that need to
preserve a console destination can buffer its bytes and replay them after
restoring that sink.
}
