\name{match_stored_names}
\alias{match_stored_names}
\title{Match Ordinary Inspection Names Without Package Dispatch}
\usage{match_stored_names(values, choices)}
\arguments{
\item{values}{An ordinary character vector of names to find.}
\item{choices}{An ordinary character vector of candidate names.}
}
\description{Uses R's native matching operation for internal class and method
names. Classed and ALTREP vectors are rejected. Package replacements of base
matching functions are not invoked.}
\value{The first matching index in choices for each value, or zero.}
