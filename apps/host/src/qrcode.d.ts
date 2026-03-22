declare module "qrcode" {
  interface QRCodeOptions {
    margin?: number;
    width?: number;
  }

  const QRCode: {
    toDataURL(value: string, options?: QRCodeOptions): Promise<string>;
  };

  export default QRCode;
}
