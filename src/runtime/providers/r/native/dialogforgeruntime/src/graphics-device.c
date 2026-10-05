#define R_NO_REMAP
#include <R.h>
#include <Rinternals.h>
#include <R_ext/GraphicsEngine.h>
#include <R_ext/GraphicsDevice.h>

typedef struct df_graphics_observation {
    pDevDesc device;
    int number;
    int closed;
    DevDesc driver;
    void (*original_close)(pDevDesc);
    SEXP token;
    struct df_graphics_observation *next;
} df_graphics_observation;

static df_graphics_observation *observed_devices = NULL;

/* Geometry and clipping bounds change during ordinary drawing. Ownership
 * instead follows the driver's private state and callback identities. Compare
 * typed pointers without calling a driver or inspecting its private memory. */
static int df_graphics_driver_is_current(pDevDesc device,
    const df_graphics_observation *observation)
{
    const DevDesc *driver = &observation->driver;
    return device->deviceSpecific == driver->deviceSpecific &&
        device->activate == driver->activate &&
        device->circle == driver->circle &&
        device->clip == driver->clip &&
        device->deactivate == driver->deactivate &&
        device->locator == driver->locator &&
        device->line == driver->line &&
        device->metricInfo == driver->metricInfo &&
        device->mode == driver->mode &&
        device->newPage == driver->newPage &&
        device->polygon == driver->polygon &&
        device->polyline == driver->polyline &&
        device->rect == driver->rect &&
        device->path == driver->path &&
        device->raster == driver->raster &&
        device->cap == driver->cap &&
        device->size == driver->size &&
        device->strWidth == driver->strWidth &&
        device->text == driver->text &&
        device->onExit == driver->onExit &&
        device->getEvent == driver->getEvent &&
        device->newFrameConfirm == driver->newFrameConfirm &&
        device->textUTF8 == driver->textUTF8 &&
        device->strWidthUTF8 == driver->strWidthUTF8 &&
        device->eventHelper == driver->eventHelper &&
        device->holdflush == driver->holdflush &&
        device->setPattern == driver->setPattern &&
        device->releasePattern == driver->releasePattern &&
        device->setClipPath == driver->setClipPath &&
        device->releaseClipPath == driver->releaseClipPath &&
        device->setMask == driver->setMask &&
        device->releaseMask == driver->releaseMask &&
        device->defineGroup == driver->defineGroup &&
        device->useGroup == driver->useGroup &&
        device->releaseGroup == driver->releaseGroup &&
        device->stroke == driver->stroke &&
        device->fill == driver->fill &&
        device->fillStroke == driver->fillStroke &&
        device->capabilities == driver->capabilities &&
        device->glyph == driver->glyph;
}

/* Traverse only live slots through R's public device API, never an unchecked
 * external index. Device numbers and allocation addresses may both be reused. */
static pDevDesc df_open_graphics_device(int number)
{
    if (number < 2 || NoDevices()) {
        return NULL;
    }
    int first = curDevice();
    int current = first;
    do {
        if (current + 1 == number) {
            pGEDevDesc engine = GEgetDevice(current);
            return engine ? engine->dev : NULL;
        }
        current = nextDevice(current);
    } while (current != first);
    return NULL;
}

static void df_remove_graphics_observation(df_graphics_observation *observation)
{
    df_graphics_observation **entry = &observed_devices;
    while (*entry) {
        if (*entry == observation) {
            *entry = observation->next;
            observation->next = NULL;
            return;
        }
        entry = &(*entry)->next;
    }
}

static void df_observed_graphics_close(pDevDesc device)
{
    df_graphics_observation *observation = observed_devices;
    while (observation && observation->device != device) {
        observation = observation->next;
    }
    if (!observation) {
        Rf_error("DialogForge graphics close has no owning observation.");
    }
    void (*original_close)(pDevDesc) = observation->original_close;
    observation->closed = 1;
    df_remove_graphics_observation(observation);
    device->close = original_close;
    /* No R callback, allocation or publication is introduced into driver close.
     * Let the original driver perform exactly its original physical cleanup. */
    if (original_close) {
        original_close(device);
    }
}

static void df_release_graphics_observation(SEXP token)
{
    df_graphics_observation *observation = R_ExternalPtrAddr(token);
    if (!observation) {
        return;
    }
    if (!observation->closed) {
        pDevDesc current = df_open_graphics_device(observation->number);
        if (current == observation->device && current->close == df_observed_graphics_close) {
            current->close = observation->original_close;
        }
        df_remove_graphics_observation(observation);
    }
    R_ClearExternalPtr(token);
    R_Free(observation);
}

static int df_graphics_device_number(SEXP which)
{
    if (TYPEOF(which) != INTSXP || ALTREP(which) || XLENGTH(which) != 1 ||
        INTEGER(which)[0] == NA_INTEGER) {
        Rf_error("Graphics observation requires one ordinary device number.");
    }
    return INTEGER(which)[0];
}

SEXP df_observe_graphics_device(SEXP which)
{
    int number = df_graphics_device_number(which);
    pDevDesc device = df_open_graphics_device(number);
    if (!device) {
        Rf_error("Cannot observe a closed or null graphics device.");
    }
    df_graphics_observation *existing = observed_devices;
    while (existing && existing->device != device) {
        existing = existing->next;
    }
    if (existing) {
        if (device->close != df_observed_graphics_close ||
            !df_graphics_driver_is_current(device, existing)) {
            Rf_error("Observed graphics device driver callbacks were replaced.");
        }
        return existing->token;
    }
    SEXP tag = Rf_install("dialogforge.graphics.observation");
    SEXP token = PROTECT(R_MakeExternalPtr(NULL, tag, R_NilValue));
    df_graphics_observation *observation = R_Calloc(1, df_graphics_observation);
    observation->device = device;
    observation->driver = *device;
    observation->number = number;
    observation->original_close = device->close;
    observation->token = token;
    observation->next = observed_devices;
    R_SetExternalPtrAddr(token, observation);
    R_RegisterCFinalizerEx(token, df_release_graphics_observation, TRUE);
    observed_devices = observation;
    device->close = df_observed_graphics_close;
    UNPROTECT(1);
    return token;
}

SEXP df_graphics_device_is_current(SEXP token, SEXP which)
{
    int number = df_graphics_device_number(which);
    if (token == R_NilValue) {
        return Rf_ScalarLogical(FALSE);
    }
    if (TYPEOF(token) != EXTPTRSXP ||
        R_ExternalPtrTag(token) != Rf_install("dialogforge.graphics.observation")) {
        Rf_error("Graphics observation requires a DialogForge device token.");
    }
    df_graphics_observation *observation = R_ExternalPtrAddr(token);
    if (!observation || observation->closed || number != observation->number) {
        return Rf_ScalarLogical(FALSE);
    }
    pDevDesc current = df_open_graphics_device(number);
    return Rf_ScalarLogical(current == observation->device &&
        current && current->close == df_observed_graphics_close &&
        df_graphics_driver_is_current(current, observation));
}

/* Publication can retire while a foreign callback still uses this physical
 * device. Keep its backing resources alive until the observed device closes. */
SEXP df_graphics_device_is_open(SEXP token, SEXP which)
{
    int number = df_graphics_device_number(which);
    if (TYPEOF(token) != EXTPTRSXP ||
        R_ExternalPtrTag(token) != Rf_install("dialogforge.graphics.observation")) {
        Rf_error("Graphics lifetime requires a DialogForge device token.");
    }
    df_graphics_observation *observation = R_ExternalPtrAddr(token);
    return Rf_ScalarLogical(observation && !observation->closed &&
        number == observation->number &&
        df_open_graphics_device(number) == observation->device);
}
