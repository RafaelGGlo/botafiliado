export function assertDashboardOwner(report, pid) {
 if (!report || report.runtimePid !== pid || report.botRunning !== true || report.botStopping || report.stale) {
  throw Error('O painel na porta 3210 pertence a outra instancia ou esta desatualizado. Encerre o painel antigo antes de iniciar o bot.');
 }
 return report;
}
