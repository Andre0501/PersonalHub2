# Segurança, privacidade e operação

## Fronteiras de confiança

A API verifica assinatura ES256 ou RS256, chave pública do emissor configurado, issuer, audience, expiração, subject UUID e papel autenticado. O laboratório usa um emissor local de teste. Em homologação, configure um projeto Supabase Auth com chaves assimétricas e confirmação de e-mail. A URL de verificação vem exclusivamente da configuração do servidor. O perfil profissional é resolvido no banco. O navegador usa apenas a chave publicável. Tokens e dados de saúde permanecem em memória durante a sessão do cliente técnico. [Supabase, JSON Web Tokens](https://supabase.com/docs/guides/auth/jwts) · [Supabase, signing keys](https://supabase.com/docs/guides/auth/signing-keys)

A API acessa um schema privado com login separado do proprietário das migrações. Em Supabase hospedado, mantenha personalhub fora dos schemas expostos à Data API e confira privilégios concedidos a anon e authenticated. Desative a Data API quando o projeto puder operar sem ela. A autorização por objeto do NestJS controla o acesso à aplicação. Uma credencial de runtime comprometida ainda teria alcance sobre as tabelas concedidas. Proteja-a no gerenciador de segredos, limite a rede e teste o isolamento também com os papéis reais do ambiente. [Supabase, Securing your API](https://supabase.com/docs/guides/api/securing-your-api)

| Ator | Ler histórico do aluno | Modificar | Limites |
|---|---|---|---|
| Aluno titular | Fichas publicadas destinadas a ele, execuções, peso e sua agenda | Suas execuções, pesos e vínculos | Não publica avaliação profissional nem opera a agenda do personal |
| Personal com vínculo ativo e consentimento vigente | Histórico compartilhável e agenda do próprio vínculo | Seu catálogo, suas fichas e suas sessões | Não edita o peso do aluno, fichas do antecessor ou rascunhos de terceiros |
| Personal anterior | Resumo administrativo da relação encerrada | Catálogo e recursos próprios fora do contexto encerrado | A autoria antiga não permite nova leitura de dados do aluno |
| Operador privilegiado futuro | Apenas escopo consentido ou respaldado pela finalidade administrativa aplicável | Ação específica com identidade, autoridade, escopo e prazo revalidados | Identidade fora de users.role, MFA e evento canônico auditável |
| Provedor de cobrança futuro | Identificador comercial do personal e os dados exigidos para pagamento | Fonte externa de eventos a verificar e reconciliar | Separação dos dados de treino, saúde e alimentação |

## LGPD e tratamento de dados

Cadastro identifica pessoas. Avaliações, medições e relatos alimentares podem revelar informações de saúde. O desenho trata esses dados com proteção reforçada. A LGPD define dados sensíveis no art. 5º, prevê hipóteses específicas no art. 11, direitos no art. 18 e medidas de segurança no art. 46. O aceite funcional versionado registra a autorização de acesso para determinado personal. A base legal, os papéis de cada agente e a necessidade do tratamento precisam ser avaliados por finalidade antes de abrir um piloto com dados reais. [Lei nº 13.709/2018, texto oficial](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)

| Categoria | Finalidade | Minimização, acesso e destinação proposta |
|---|---|---|
| Identidade e perfil | Autenticação e prestação do serviço | E-mail normalizado e nome de exibição. O convite usa código aleatório. Solicitações do titular seguem verificação de identidade |
| Treinos, peso, avaliações e alimentação | Acompanhamento do aluno | Acesso por papel, titular e finalidade. Snapshots identificáveis entram na matriz de retenção e eliminação por agregado. Revisões operacionais preservam autoria |
| Convite e consentimento | Registrar quem autorizou o quê e quando | Escopo, aviso, finalidade e ator versionados. O visualizador deve conseguir recuperar o texto exato da versão exibida. Arquivar versões antes de substituir o aviso |
| Agenda e disputa | Prestação e registro de atendimento | Escopo do vínculo e histórico próprio do aluno. Separar dados de terceiros em pedidos de exportação |
| Auditoria e idempotência | Explicar decisões e evitar duplicidade | HMAC da intenção, recibo mínimo e IDs. O desenho de retenção exige horizonte definido e identificador da versão da chave antes de rotação ou expurgo. Evitar e-mail, tokens e medidas nos logs |
| Cobrança | Plano e reconciliação | Guardar referências do PSP. O checkout será hospedado pelo provedor. Segregar eventos financeiros de medições e notas |
| Backup e cache | Recuperação | Backups sofrerão controles de acesso e criptografia. Após restauração, reaplicar restrições/destinações antes de reabrir o tráfego. A página offline pública é o único conteúdo em Cache Storage no cliente técnico |

O responsável por privacidade documentará controlador e operador por finalidade, contratos com subprocessadores, transferência internacional caso aplicável, bases de tratamento, canal para direitos, condições de retenção e eventual relatório de impacto. A função de personal, o SaaS e o provedor podem atuar em papéis distintos conforme o tratamento concreto. Prazos de conservação por categoria exigem fundamento e política versionada.

O fluxo de incidente prevê conter o evento, preservar evidência mínima, identificar titulares e natureza dos dados, avaliar risco ou dano relevante e acionar a comunicação cabível à ANPD e aos titulares. O responsável usa o regulamento vigente e registra o momento do conhecimento e as providências. [ANPD, Comunicação de Incidente de Segurança](https://www.gov.br/anpd/pt-br/assuntos/incidente-de-seguranca)

## Registro de riscos

| Risco e impacto | Controle da 0.1 | Prova ou ação seguinte |
|---|---|---|
| Leitura de outro aluno ou após revogação | Consulta de vínculo e consentimento na transação, escopo por objeto, 404 uniforme | Negativas com dois alunos e dois personais. Repetir em homologação com chaves reais |
| Convites usados para varrer e-mails | UUID aleatório compartilhado pelo aluno, retorno uniforme e limite de 20 envios por personal/hora | Medir abuso por conta e implantar limite de borda por IP, com minimização |
| Convite aceito duas vezes ou excesso de capacidade | Lock do aluno e do personal, cota no commit, índice parcial e idempotência | Testes simultâneos de aceitações e disputa pela última vaga |
| Corrupção de prescrição ou revisão | Snapshot imutável, pertencimento por versão e agregado, versão esperada | Testes de séries extras, correção, versão antiga e rollback |
| Conteúdo privado em cache ou telemetria | Respostas no-store, sessão em memória, exclusão de corpo e tokens do log de comandos | Ensaio no navegador verificou as chaves do cache. Revisar também CDN, proxy e monitoramento reais |
| Credencial de banco excede a função | Login da API separado, sem DELETE nem concessões nos módulos fechados | Testes de privilégios. Verificar rede, rotação de segredos e permissões da hospedagem |
| Excluir parcialmente dados ou restaurar dados já destinados | Esquema de políticas, casos e ações. Runtime sem operações destrutivas | Simular exportação, eliminação justificada e restauração com titulares mistos |
| Evento financeiro duplicado ou estado externo desconhecido | Contrato de deduplicação por namespace e referência no banco | Validar assinatura e reconsulta canônica em sandbox e simular timeout antes de habilitar cobrança |

## Subir API e web com Supabase Auth real

1. Use ambientes separados de desenvolvimento, homologação e produção. Provisione PostgreSQL compatível, a extensão btree_gist, um proprietário de migrações e um login dedicado chamado personalhub_api. Forneça as senhas por um gerenciador de segredos.
2. Copie .env.example para .env na raiz e apps/web/.env.example para apps/web/.env.local. Defina DATABASE_URL para o login da API e DIRECT_DATABASE_URL para o proprietário com acesso direto a migrações. Use conexões TLS do provedor. Configure as URLs de origem da API e da web.
3. Configure SUPABASE_URL, VITE_SUPABASE_URL e a chave publicável no cliente. Na configuração Auth do provedor, habilite e-mail e senha, confirmação de e-mail, chaves assimétricas e os URLs de redirecionamento do ambiente. Gere AUDIT_HMAC_KEY com 32 bytes aleatórios.
4. Execute npm ci, npm run db:deploy e aplique scripts/runtime-grants.sql no mesmo banco como proprietário. A API usa DATABASE_URL. O processo web nunca recebe essas credenciais.
5. Execute npm run build, npm start e, em um segundo terminal de desenvolvimento, npm run web. Para hospedagem, publique apps/web/dist em HTTPS, sirva a API atrás de proxy TLS e configure HOST adequado à rede privada de containers. Restrinja a origem WEB_ORIGIN e proteja a comunicação interna.
6. Faça cadastro e confirmação de e-mail com duas contas de teste autorizadas, teste rotação de chave e recuperação de senha, valide as negativas de acesso e os papéis do Supabase. Verifique logins, redirecionamentos, integridade de migrações e backup antes da promoção.

## Entrega, capacidade e recuperação

O pipeline proposto para cada alteração reúne instalação pelo lockfile, geração Prisma, TypeScript, build React, PostgreSQL descartável com migrações, testes de integração, ensaio no navegador, validação do OpenAPI e revisão das dependências. As migrações são versionadas. Em produção, um job separado aplica o SQL uma vez antes da implantação compatível. Mudanças de coluna existentes devem seguir expansão, transição e contração.

A API é stateless para dados de domínio e pode escalar em réplicas, com JWKS em memória por processo e deduplicação/locks centralizados no PostgreSQL. Cada réplica abre um pool limitado. Dimensione a soma dos pools para o limite do banco e reserve conexões para operação. Um worker futuro cuidará de webhooks, exportações e reconciliação. O tráfego do piloto não justifica dividir os módulos em microsserviços.

Meça p95 por operação, erros 5xx, conflitos 409 por causa, negações 403/404 agregadas, falhas JWKS, uso de conexões e latência de locks. O piloto tem metas propostas de RPO de 24 horas e RTO de 4 horas. Faça restauração em ambiente isolado, verifique os registros de destinação e acessos revogados, execute uma jornada sintética e registre os tempos reais antes de prometer um SLA. A estratégia de retorno é reimplantar a aplicação anterior compatível e corrigir a migração adiante. Restauração integral requer verificação do impacto nos dados novos.
