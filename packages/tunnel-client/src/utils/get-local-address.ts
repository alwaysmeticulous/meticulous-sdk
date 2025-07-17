const LOCAL_ADDRESS_ENV_VARIABLE =
  "METICULOUS_TUNNEL_CLIENT_REQUEST_LOCAL_ADDRESS";

export const getLocalAddress = () => {
  const localAddress = process.env[LOCAL_ADDRESS_ENV_VARIABLE];

  return {
    ...(localAddress ? { localAddress } : {}),
  };
};
