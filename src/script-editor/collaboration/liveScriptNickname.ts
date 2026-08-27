export const LIVE_SCRIPT_MAX_NICKNAME_LENGTH = 40;


export type LiveScriptNicknameResult =
    | { ok: true; nickname: string; key: string }
    | { ok: false; message: string };


export const validateLiveScriptNickname = function(
    value: unknown
): LiveScriptNicknameResult {
    const nickname = String(value || "")
        .normalize("NFKC")
        .trim()
        .replace(/\s+/gu, " ");

    if (!nickname) {
        return { ok: false, message: "Enter a nickname for this classroom." };
    }

    if (nickname.length > LIVE_SCRIPT_MAX_NICKNAME_LENGTH) {
        return {
            ok: false,
            message: `Use a nickname of ${LIVE_SCRIPT_MAX_NICKNAME_LENGTH} characters or fewer.`
        };
    }

    if (/[\p{Cc}\p{Cf}\p{Cs}]/u.test(nickname)) {
        return { ok: false, message: "Nickname contains unsupported characters." };
    }

    return {
        ok: true,
        nickname,
        key: nickname.toLocaleLowerCase("en-US")
    };
};
