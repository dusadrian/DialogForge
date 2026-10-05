\name{stored_graph_is_inspectable}
\alias{stored_graph_is_inspectable}
\title{Check Stored Contents Before Automatic Inspection}
\usage{stored_graph_is_inspectable(value)}
\arguments{\item{value}{An already obtained value, not a lazy binding.}}
\description{Checks stored list contents and attributes before R-level
inspection. Unknown ALTREP classes are rejected before reading their lengths
or elements. Base compact integer/real sequences, their stock attribute wrappers,
and deferred strings are
recognized by class identity against stock prototypes, with their backing
contents checked recursively. Reference contents are not traversed.}
\value{A logical scalar. FALSE also means the bounded traversal was exceeded.
TRUE does not authorize S3/S4 method dispatch or explicit object inspection.}
