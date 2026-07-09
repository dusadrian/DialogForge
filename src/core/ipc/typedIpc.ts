export interface IpcInvokeTransport {
    invoke(
        channel: string,
        ...args: unknown[]
    ): Promise<unknown>;
}


export interface IpcEventTransport {
    on(
        channel: string,
        listener: (event: any, ...args: any[]) => void
    ): unknown;
}


export interface IpcSendTransport {
    send(
        channel: string,
        ...args: unknown[]
    ): void;
}


export const invokeTypedIpcRoute = function<
    Arguments extends unknown[],
    Result
>(
    transport: IpcInvokeTransport,
    channel: string,
    ...args: Arguments
): Promise<Result> {
    return transport.invoke(
        channel,
        ...args
    ) as Promise<Result>;
};


export const onTypedIpcEvent = function<Payload>(
    transport: IpcEventTransport,
    channel: string,
    callback: (payload: Payload) => void
): void {
    transport.on(channel, (_event, payload) => {
        callback(payload as Payload);
    });
};


export const sendTypedIpcCommand = function<Arguments extends unknown[]>(
    transport: IpcSendTransport,
    channel: string,
    ...args: Arguments
): void {
    transport.send(channel, ...args);
};
