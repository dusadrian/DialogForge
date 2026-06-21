import * as fs from "fs";
import * as path from "path";
import {
    spawnSync
} from "child_process";


interface ProductManifest {
    id?: string;
    name?: string;
    version?: string;
}


interface NotaryHistoryEntry {
    createdDate?: string;
    id?: string;
    name?: string;
    status?: string;
}


const projectRoot = path.resolve(__dirname, "../../..");
const keychainProfile = String(
    process.env.DIALOGFORGE_NOTARY_PROFILE || "developer-id-notary"
).trim();


const fail = function(message: string): never {
    throw new Error(message);
};


const requireMacOS = function(): void {
    if (process.platform !== "darwin") {
        fail("macOS notarization commands must run on macOS.");
    }
};


const productDmgPath = function(productId: string): string {
    const normalizedId = String(productId || "").trim();

    if (!normalizedId) {
        fail("Missing product id. Expected DialogR or DialogQCA.");
    }

    const productRoot = path.resolve(projectRoot, "..", normalizedId);
    const manifestPath = path.join(productRoot, "product.json");

    if (!fs.existsSync(manifestPath)) {
        fail(`Missing product manifest: ${manifestPath}`);
    }

    const manifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf8")
    ) as ProductManifest;
    const productName = String(
        manifest.name || manifest.id || normalizedId
    ).trim();
    const version = String(manifest.version || "").trim();

    if (!version) {
        fail(`Missing product version in ${manifestPath}`);
    }

    const fileName = productName.replace(/\s+/g, "_")
        + `_${version}_silicon.dmg`;
    const dmgPath = path.join(projectRoot, "build", "output", fileName);

    if (!fs.existsSync(dmgPath)) {
        fail(`Missing built DMG: ${dmgPath}`);
    }

    return dmgPath;
};


const runInherited = function(args: string[]): void {
    const result = spawnSync("xcrun", args, {
        cwd: projectRoot,
        stdio: "inherit"
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        fail(`xcrun failed with exit code ${String(result.status)}.`);
    }
};


const readHistory = function(): NotaryHistoryEntry[] {
    const result = spawnSync(
        "xcrun",
        [
            "notarytool",
            "history",
            "--keychain-profile",
            keychainProfile,
            "--output-format",
            "json"
        ],
        {
            cwd: projectRoot,
            encoding: "utf8"
        }
    );

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        process.stderr.write(String(result.stderr || ""));
        fail(`notarytool history failed with exit code ${String(result.status)}.`);
    }

    const parsed = JSON.parse(String(result.stdout || "{}")) as {
        history?: NotaryHistoryEntry[];
    } | NotaryHistoryEntry[];

    return Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.history)
            ? parsed.history
            : [];
};


const latestHistoryEntry = function(
    history: NotaryHistoryEntry[]
): NotaryHistoryEntry | null {
    return history.slice().sort((left, right) => {
        const leftTime = Date.parse(String(left.createdDate || ""));
        const rightTime = Date.parse(String(right.createdDate || ""));
        const normalizedLeft = Number.isFinite(leftTime) ? leftTime : 0;
        const normalizedRight = Number.isFinite(rightTime) ? rightTime : 0;

        return normalizedRight - normalizedLeft;
    })[0] || null;
};


const submit = function(productId: string): void {
    const dmgPath = productDmgPath(productId);

    console.log(`Submitting ${dmgPath}`);
    runInherited([
        "notarytool",
        "submit",
        dmgPath,
        "--keychain-profile",
        keychainProfile
    ]);
};


const showLatestHistory = function(): void {
    const latest = latestHistoryEntry(readHistory());

    if (!latest) {
        throw new Error("No notarization submissions were returned.");
    }

    console.log(`Name: ${String(latest.name || "(unknown)")}`);
    console.log(`Status: ${String(latest.status || "(unknown)")}`);
    console.log(`Created: ${String(latest.createdDate || "(unknown)")}`);
    console.log(`ID: ${String(latest.id || "(unknown)")}`);
};


const staple = function(productId: string): void {
    const dmgPath = productDmgPath(productId);

    console.log(`Stapling ${dmgPath}`);
    runInherited([
        "stapler",
        "staple",
        dmgPath
    ]);
};


const main = function(): void {
    requireMacOS();
    const action = String(process.argv[2] || "").trim();
    const productId = String(process.argv[3] || "").trim();

    if (action === "submit") {
        submit(productId);
        return;
    }

    if (action === "history") {
        showLatestHistory();
        return;
    }

    if (action === "staple") {
        staple(productId);
        return;
    }

    fail("Unknown notarization action. Expected submit, history, or staple.");
};


main();
