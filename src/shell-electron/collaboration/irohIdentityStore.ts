import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";


const IDENTITY_FILE_NAME = "iroh-identity-secret-v1";
const IDENTITY_FILE_MAGIC = Buffer.from("DFI1", "ascii");
const IDENTITY_KEY_BYTES = 32;


export interface IrohIdentityProtection {
    protect(secret: Uint8Array): Buffer;
    unprotect(payload: Buffer): Uint8Array;
}


export interface IrohIdentityStore {
    readOrCreate(): Uint8Array;
}


export interface IrohIdentityStoreOptions {
    userDataPath: string;
    protection?: IrohIdentityProtection;
}


const encodeIdentity = function(
    secret: Uint8Array,
    protection?: IrohIdentityProtection
): Buffer {
    const protectedSecret = protection
        ? protection.protect(secret)
        : Buffer.from(secret);
    const mode = protection ? 1 : 0;

    return Buffer.concat([
        IDENTITY_FILE_MAGIC,
        Buffer.from([mode]),
        protectedSecret
    ]);
};


const decodeIdentity = function(
    payload: Buffer,
    protection?: IrohIdentityProtection
): Uint8Array {
    if (payload.length < IDENTITY_FILE_MAGIC.length + 1
        || !payload.subarray(0, IDENTITY_FILE_MAGIC.length).equals(IDENTITY_FILE_MAGIC)) {
        throw new Error("Stored iroh identity has an invalid format.");
    }

    const mode = payload[IDENTITY_FILE_MAGIC.length];
    const encodedSecret = payload.subarray(IDENTITY_FILE_MAGIC.length + 1);
    let secret: Uint8Array;

    if (mode === 1) {
        if (!protection) {
            throw new Error("Stored iroh identity requires secure storage.");
        }

        secret = protection.unprotect(encodedSecret);
    }
    else if (mode === 0) {
        if (protection) {
            throw new Error("Stored iroh identity is not protected by secure storage.");
        }

        secret = encodedSecret;
    }
    else {
        throw new Error("Stored iroh identity has an unknown protection mode.");
    }

    if (secret.byteLength !== IDENTITY_KEY_BYTES) {
        throw new Error("Stored iroh identity has an invalid key length.");
    }

    return new Uint8Array(secret);
};


export const createIrohIdentityStore = function(
    options: IrohIdentityStoreOptions
): IrohIdentityStore {
    const identityDirectory = path.join(options.userDataPath, "collaboration");
    const identityPath = path.join(identityDirectory, IDENTITY_FILE_NAME);

    const read = function(): Uint8Array {
        const stat = fs.lstatSync(identityPath);

        if (!stat.isFile() || stat.isSymbolicLink()) {
            throw new Error("Stored iroh identity is not a regular file.");
        }

        if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
            fs.chmodSync(identityPath, 0o600);
        }

        return decodeIdentity(
            fs.readFileSync(identityPath),
            options.protection
        );
    };

    const readOrCreate = function(): Uint8Array {
        fs.mkdirSync(identityDirectory, {
            recursive: true,
            mode: 0o700
        });

        if (fs.existsSync(identityPath)) {
            return read();
        }

        const secret = crypto.randomBytes(IDENTITY_KEY_BYTES);
        const encoded = encodeIdentity(secret, options.protection);

        try {
            fs.writeFileSync(identityPath, encoded, {
                flag: "wx",
                mode: 0o600
            });
        }
        catch (error) {
            const code = error && typeof error === "object"
                ? String((error as { code?: unknown }).code || "")
                : "";

            if (code !== "EEXIST") {
                throw error;
            }

            return read();
        }

        return new Uint8Array(secret);
    };

    return { readOrCreate };
};
