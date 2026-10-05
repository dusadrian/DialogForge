\name{stored_list_fields}
\alias{stored_list_fields}
\title{Read Stored List Fields Without Dispatch}
\usage{stored_list_fields(value, name = NULL)}
\arguments{
    \item{value}{A stored R value.}
    \item{name}{An ordinary member name, or NULL for name discovery only.}
}
\description{Reads shallow fields of plain lists and exact data frames through
the public R C API. Does not dispatch methods, visit field contents, invoke
ALTREP callbacks or force stored promises. S4, custom classes, ALTREP lists or
names, malformed names and lists over 4096 fields are restricted. Names are
returned without attributes so later string processing cannot dispatch methods.}
\value{A list containing inspectable, names, classes and value. The named value
is returned only for a stored, non-promise matching member. Restricted inputs
return FALSE, empty names/classes and NULL.}
