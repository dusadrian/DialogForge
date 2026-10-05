#define R_NO_REMAP
#include <R.h>
#include <Rinternals.h>
#include <R_ext/GraphicsEngine.h>
#include <R_ext/GraphicsDevice.h>

/* Test-only foreign driver adaptation. It still draws through the original
 * callback, while changing identity without changing the device or its name. */
static pDevDesc replaced_device = NULL;
static void (*original_line)(double, double, double, double,
    const pGEcontext, pDevDesc) = NULL;
static pDevDesc close_device = NULL;
static void (*original_close)(pDevDesc) = NULL;

static void foreign_close(pDevDesc device)
{
    void (*callback)(pDevDesc) = original_close;
    close_device = NULL;
    original_close = NULL;
    callback(device);
}

SEXP replace_graphics_close(SEXP replace)
{
    if (TYPEOF(replace) != LGLSXP || XLENGTH(replace) != 1 ||
        LOGICAL(replace)[0] == NA_LOGICAL || NoDevices()) {
        Rf_error("Graphics probe requires a live device and one boolean.");
    }
    pDevDesc device = GEgetDevice(curDevice())->dev;
    if (LOGICAL(replace)[0]) {
        if (close_device || !device->close) {
            Rf_error("Graphics probe cannot replace this close callback.");
        }
        close_device = device;
        original_close = device->close;
        device->close = foreign_close;
    }
    else {
        if (device != close_device || device->close != foreign_close) {
            Rf_error("Graphics probe cannot restore a different close driver.");
        }
        device->close = original_close;
        close_device = NULL;
        original_close = NULL;
    }
    return R_NilValue;
}

static void foreign_line(double x1, double y1, double x2, double y2,
    const pGEcontext context, pDevDesc device)
{
    original_line(x1, y1, x2, y2, context, device);
}

SEXP replace_graphics_line(SEXP replace)
{
    if (TYPEOF(replace) != LGLSXP || XLENGTH(replace) != 1 ||
        LOGICAL(replace)[0] == NA_LOGICAL || NoDevices()) {
        Rf_error("Graphics probe requires a live device and one boolean.");
    }
    pDevDesc device = GEgetDevice(curDevice())->dev;
    if (LOGICAL(replace)[0]) {
        if (replaced_device || !device->line) {
            Rf_error("Graphics probe cannot replace this callback.");
        }
        replaced_device = device;
        original_line = device->line;
        device->line = foreign_line;
    }
    else {
        if (device != replaced_device || device->line != foreign_line) {
            Rf_error("Graphics probe cannot restore a different driver.");
        }
        device->line = original_line;
        replaced_device = NULL;
        original_line = NULL;
    }
    return R_NilValue;
}
