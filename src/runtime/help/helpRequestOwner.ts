export interface HelpRequestOwner {
    begin(): () => boolean;
    retire(): void;
}


export const createHelpRequestOwner = function(): HelpRequestOwner {
    let sequence = 0;

    return {
        begin(): () => boolean {
            const request = ++sequence;

            return () => request === sequence;
        },
        retire(): void {
            sequence += 1;
        }
    };
};
