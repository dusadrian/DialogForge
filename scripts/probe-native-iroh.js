"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");


const readArgs = function() {
    const options = { version: "", binary: "" };
    const args = process.argv.slice(2);

    for (let index = 0; index < args.length; index += 1) {
        if (args[index] === "--version") {
            index += 1;
            options.version = String(args[index] || "").trim();
            continue;
        }
        if (args[index] === "--binary") {
            index += 1;
            options.binary = path.resolve(String(args[index] || "").trim());
            continue;
        }

        throw new Error(`Unknown native iroh probe argument: ${args[index]}`);
    }

    if (!options.version && !options.binary) {
        throw new Error("Missing required --version or --binary argument.");
    }

    return options;
};


// This probe is only meaningful on genuine Intel silicon. Rosetta translates the
// x86_64 slice to arm64, which neither faults on unaligned vector loads nor
// exposes AVX, so a broken binary passes here exactly like a working one.
const isAppleSilicon = function() {
    const result = spawnSync("sysctl", ["-n", "hw.optional.arm64"], {
        encoding: "utf8"
    });

    return String(result.stdout || "").trim() === "1";
};


const installIroh = function(version) {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "iroh-probe-"));

    fs.writeFileSync(
        path.join(workDir, "package.json"),
        `${JSON.stringify({ name: "iroh-probe", private: true }, null, 4)}\n`
    );

    const install = spawnSync(
        "npm",
        [
            "install",
            `@number0/iroh@${version}`,
            "--no-audit",
            "--no-fund",
            "--loglevel=error"
        ],
        { cwd: workDir, encoding: "utf8", timeout: 300000 }
    );

    if (install.status !== 0) {
        throw new Error(
            `Installing @number0/iroh@${version} failed: `
            + `${(install.stderr || "").trim()}`
        );
    }

    return workDir;
};


// The probe must run in a child process: a misaligned-stack fault in the native
// binary takes the whole process down and cannot be caught in-process.
const probeBinding = function(bindingPath) {
    const probe = `
        const binding = require(${JSON.stringify(bindingPath)});
        (async () => {
            if (binding.Endpoint && typeof binding.Endpoint.bind === "function") {
                const builder = binding.Endpoint.builder();
                builder.applyMinimal();
                builder.bindAddr("127.0.0.1:0");
                const endpoint = await builder.bind();
                const nodeId = endpoint.id().toString();
                await endpoint.close();
                return nodeId;
            }
            const node = await binding.Iroh.memory();
            const nodeId = await node.net.nodeId();
            await node.node.shutdown();
            return nodeId;
        })()
            .then((nodeId) => {
                console.log("ok " + nodeId);
                process.exit(0);
            })
            .catch((error) => {
                console.log("error " + error.message);
                process.exit(3);
            });
    `;

    return spawnSync(process.execPath, ["-e", probe], {
        encoding: "utf8",
        timeout: 120000
    });
};


const main = function() {
    const options = readArgs();
    const label = options.binary || options.version;
    const installedRoot = options.binary ? "" : installIroh(options.version);
    const bindingPath = options.binary || [
        path.join(installedRoot, "node_modules/@number0/iroh/iroh.darwin-x64.node"),
        path.join(installedRoot, "node_modules/@number0/iroh-darwin-x64/iroh.darwin-x64.node"),
        path.join(installedRoot, "node_modules/@number0/iroh-darwin-universal/iroh.darwin-universal.node")
    ].find((candidate) => fs.existsSync(candidate));

    const cpuBrand = spawnSync("sysctl", ["-n", "machdep.cpu.brand_string"], {
        encoding: "utf8"
    });

    console.log(
        `iroh ${label} on ${process.platform}/${process.arch}`
        + ` (${String(cpuBrand.stdout || "unknown cpu").trim()})`
    );

    if (!bindingPath || !fs.existsSync(bindingPath)) {
        console.log(`FAIL no binary to probe: ${bindingPath}`);
        process.exitCode = 1;
        return;
    }

    const architectures = spawnSync("lipo", ["-archs", bindingPath], {
        encoding: "utf8"
    });

    console.log(`  slices: ${(architectures.stdout || "unknown").trim()}`);

    const result = probeBinding(bindingPath);
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();

    if (result.signal || result.status !== 0) {
        console.log(
            `FAIL iroh ${label} exit=${result.status === null ? "null" : result.status}`
            + `${result.signal ? ` (${result.signal})` : ""} ${output}`
        );
        process.exitCode = 1;
        return;
    }

    if (isAppleSilicon()) {
        console.log(
            `INCONCLUSIVE iroh ${label} ${output}`
            + " — Apple silicon runs this x86_64 slice under Rosetta, which hides"
            + " the fault seen on genuine Intel hardware. Run this on an Intel Mac."
        );
        process.exitCode = 2;
        return;
    }

    console.log(`PASS iroh ${label} ${output}`);
};


if (require.main === module) {
    main();
}

module.exports = { probeBinding };
