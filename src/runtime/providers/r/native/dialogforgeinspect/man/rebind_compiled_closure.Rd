\name{rebind_compiled_closure}
\alias{rebind_compiled_closure}
\title{Bind a Compiled Control Closure to Its Runtime}
\usage{rebind_compiled_closure(value, environment, original = value)}
\arguments{
    \item{value}{An already compiled closure.}
    \item{environment}{Its new runtime environment.}
    \item{original}{The source closure whose attributes must be retained.}
}
\description{Creates a closure with the stored formals and bytecode, and the
original closure's attributes (including its source reference),
without changing the original or discarding compilation as environment replacement
in R does. Does not execute the closure or read bindings from either environment.}
\value{A compiled closure bound to environment. Invalid inputs raise an error.}
