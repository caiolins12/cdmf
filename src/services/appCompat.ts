export type CompatApp = {
  name: string;
};

const appInstance: CompatApp = {
  name: "cdmf-web",
};

export function initializeApp(): CompatApp {
  return appInstance;
}

export function getApps(): CompatApp[] {
  return [appInstance];
}

export function getApp(): CompatApp {
  return appInstance;
}
