\name{read_runtime_console_line}
\alias{read_runtime_console_line}
\title{Read one bounded line through the host console}
\usage{read_runtime_console_line(prompt, max_bytes = 262144L, host_transport = FALSE)}
\arguments{
    \item{host_transport}{For a physical host adapter read made by the shared
    prompt owner. Temporarily uses the original frontend inside an input scope.}
    \item{prompt}{One character prompt forwarded to the host console.}
    \item{max_bytes}{Maximum reply size in bytes.}
}
\description{
Uses R's public host-console interface, preserving physical interruption on the
R stack. The worker adapter uses this operation; shared prompt identity, reply
validation and evaluation outcomes remain in the shared R runtime sources.
}
\value{One complete UTF-8 line, without its line ending.}
