\name{open_output_capture}
\alias{open_output_capture}
\alias{seal_output_capture}
\alias{abort_output_capture}
\title{Experimental Native Output Journal Connections}
\usage{
open_output_capture(path)
seal_output_capture(capture)
abort_output_capture(capture)
}
\arguments{
\item{path}{A new file path in a caller-owned private directory.}
\item{capture}{The list returned by \code{open_output_capture}.}
}
\description{
Creates two writable connections sharing one native binary journal, then seals
that journal after the caller has removed its output and message sinks.
}
\value{
Opening returns a list containing an external-pointer handle and stdout/stderr
connections. Sealing returns the final producer sequence number.
Aborting closes the native file without a producer seal and returns NULL invisibly.
}
\details{
Prototype only; not used by normal DialogForge execution. Creation is exclusive.
Each frame is flushed, but neither flush nor seal acknowledges transport delivery
or renderer consumption. Frames preserve native bytes, not necessarily UTF-8.
The journal is limited to 64 MiB and individual frames to 64 KiB; exceeding the
limit raises an error rather than silently truncating. Closing connections does
not seal the journal. The caller must restore sinks before closing connections.
Warning policy, sink lifecycle, session identity, consumer decoding, cleanup
and cross-platform acceptance belong to subsequent integration work.
}
