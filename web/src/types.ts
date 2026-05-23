export interface DeployState {
  phase: string;
  steps?: { name: string; status: string }[];
  appUrl?: string;
  error?: string;
}
