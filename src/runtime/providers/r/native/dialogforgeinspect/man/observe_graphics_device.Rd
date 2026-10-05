\name{observe_graphics_device}
\alias{observe_graphics_device}
\alias{graphics_device_is_current}
\alias{graphics_device_is_open}
\title{Observe the Lifetime of a Physical Graphics Device}
\usage{
observe_graphics_device(which)
graphics_device_is_current(token, which)
graphics_device_is_open(token, which)
}
\arguments{
\item{which}{The R device number.}
\item{token}{A token returned by \code{observe_graphics_device()}.}
}
\description{
Records closure of an owned physical device without invoking R callbacks.
The close observer calls the original driver callback. A closed device token
cannot identify a new device reusing the same number or allocation address.
Dropping a live token restores the original close callback.
Current publication ownership also requires unchanged driver-private state and
drawing callbacks. The open-device check retains backing resources while that
same physical device remains live, even after publication ownership retires.
}
\value{
An opaque lifetime token, or a logical current-device result.
}
