\name{read_bounded_runtime_request}
\alias{read_bounded_runtime_request}
\alias{write_checked_runtime_frame}
\title{Read One Bounded Native Runtime Request}
\usage{
read_bounded_runtime_request(connection, max_bytes = 262144L)
write_checked_runtime_frame(connection, payload)
}
\arguments{
\item{connection}{An open blocking binary input connection owned by the caller.}
\item{max_bytes}{Maximum payload bytes, an integer from 512 to 16777216.}
\item{payload}{One UTF-8-encodable string, without framing newlines, at most 16 MiB.}
}
\description{Experimental newline framing without unbounded line allocation.}
\value{A list with status and raw bytes. Only status \code{line} contains a
dispatchable payload. Other statuses require connection retirement. The writer
returns true only when R's connection API reports the entire frame written.}
\details{LF and CRLF are accepted. The optional final CR does not count toward
the payload limit. Any error or interruption also requires retiring the connection:
the reader may already have consumed bytes. No retry or resynchronization is safe.
Zero-byte reads cannot distinguish EOF from all connection failures. A false
write result, error or interruption requires retiring the connection without
resending any prefix. Successful write is not consumer delivery acknowledgement.}
