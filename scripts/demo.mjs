export async function demoAccounts(lab) {
  const accounts = [];
  for (const [label, role, displayName] of [
    ['Entrar como Lia (aluna)', 'STUDENT', 'Lia'],
    ['Entrar como Ana (personal)', 'TRAINER', 'Ana'],
    ['Entrar como Caio (personal)', 'TRAINER', 'Caio'],
  ]) {
    const account = lab.identity(displayName.toLowerCase());
    const res = await lab.request(account, 'POST', '/me', { role, displayName });
    if (res.status !== 200) throw new Error('Falha na preparação do perfil de demonstração.');
    accounts.push({ ...account, label });
  }
  const student = (await lab.request(accounts[0], 'GET', '/me')).data;
  const w = await lab.request(accounts[0], 'POST', '/me/weights', {
    kg: 72.5,
    measuredAt: new Date().toISOString(),
  });
  const invite = await lab.request(accounts[1], 'POST', '/link-requests', {
    studentCode: student.studentCode,
  });
  if (w.status !== 201 || invite.status !== 202)
    throw new Error('Falha na preparação dos dados de demonstração.');
  return accounts;
}
