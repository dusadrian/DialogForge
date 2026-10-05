\name{closure_is_compiled}
\alias{closure_is_compiled}
\title{Inspect a Closure's Stored Compilation State}
\usage{closure_is_compiled(value)}
\arguments{
    \item{value}{An R value.}
}
\description{Tests the closure and body types through the public R C API.
Does not execute the closure, invoke methods, or inspect its enclosing environment.}
\value{TRUE for a closure with a bytecode body, otherwise FALSE.}
