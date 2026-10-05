\name{binding_info}
\alias{binding_info}
\title{Read a Binding Without Evaluating It}
\usage{binding_info(environment, name)}
\arguments{
    \item{environment}{The environment containing the binding.}
    \item{name}{One ordinary, non-missing character string.}
}
\description{Reads only the named environment frame. Does not invoke active
bindings or force delayed bindings. Does not inspect the contents of values.}
\value{A list with state, value, expression, and environment. State is one of
unbound, missing, active, delayed, forced, or value. Only value and forced
bindings return their stored value. Delayed bindings return the unevaluated
expression and its evaluation environment. Other fields are NULL.}
