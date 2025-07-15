const LOCAL_ADDRESS_ENV_VARIABLE = "METICULOUS_LOCAL_ADDRESS";
const LOCAL_PORT_ENV_VARIABLE = "METICULOUS_LOCAL_PORT";

export const getLocalAddress = () => {
  const localAddress = process.env[LOCAL_ADDRESS_ENV_VARIABLE];
  const localPort = process.env[LOCAL_PORT_ENV_VARIABLE];

  return {
    ...(localAddress ? { localAddress } : {}),
    ...(localPort ? { localPort: parseInt(localPort) } : {}),
  };
};
