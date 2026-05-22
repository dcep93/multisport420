import { md5 } from "./md5";

export const PASSWORD_MD5 = "0543de2f1884f9133f326d42578abd60";
export const PASSWORD_STORAGE_KEY = "multisport420.password.v1";

export function getInitialAuthorized() {
  return window.localStorage.getItem(PASSWORD_STORAGE_KEY) === PASSWORD_MD5;
}

export function unlock() {
  window.localStorage.setItem(PASSWORD_STORAGE_KEY, PASSWORD_MD5);
}

export function isValidPasswordInput(value: string) {
  return md5(value) === PASSWORD_MD5;
}
