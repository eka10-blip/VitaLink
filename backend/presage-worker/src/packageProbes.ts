/**
 * Phase 1 — boolean-only probes for whether native SDK packages can be imported.
 * Never logs package contents or credentials.
 */

export type PackageProbeStatus = {
  smartSpectraSdkImportable: boolean;
  livekitRtcImportable: boolean;
  probed: boolean;
};

const status: PackageProbeStatus = {
  smartSpectraSdkImportable: false,
  livekitRtcImportable: false,
  probed: false,
};

export function getPackageProbeStatus(): PackageProbeStatus {
  return { ...status };
}

export async function probeSdkPackages(): Promise<PackageProbeStatus> {
  try {
    await import('@smartspectra/node-sdk');
    status.smartSpectraSdkImportable = true;
  } catch {
    status.smartSpectraSdkImportable = false;
  }

  try {
    await import('@livekit/rtc-node');
    status.livekitRtcImportable = true;
  } catch {
    status.livekitRtcImportable = false;
  }

  status.probed = true;
  return getPackageProbeStatus();
}

export function isNodeVersionSupported(): boolean {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  return major >= 20;
}
