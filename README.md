# PersonalHub

Versão de desenvolvimento 0.1.0 • 19 de novembro de 2026

O personal pode convidar um aluno, publicar uma ficha e agendar uma sessão. O aluno pode aceitar, registrar seu peso e executar as séries da ficha. Ao trocar de personal, ele conserva o histórico. O profissional anterior perde o acesso e as sessões pendentes recebem o desfecho previsto na baseline MLG-001.

## Experimentar no computador

Use Node.js 24 LTS, npm e uma conta de usuário comum no sistema operacional. Extraia o pacote, abra o terminal na pasta que contém este arquivo e execute os dois comandos abaixo. A primeira instalação baixa as dependências.

```sh
npm ci
npm run demo
```

Abra o endereço local impresso no terminal. O laboratório inicia um PostgreSQL temporário, aplica as migrações e sobe a API NestJS, o cliente React e um emissor de identidades fictícias. As três contas entram por botões e a API verifica os tokens assinados. Ctrl+C encerra o laboratório e descarta exclusivamente os dados temporários daquela execução.

1. Entre como **Lia**. Ela tem uma medição e um convite de Ana. Leia o aviso, marque a autorização e aceite.
2. Saia e entre como **Ana**. Cadastre um exercício, crie uma ficha para Lia e publique. A agenda permite marcar uma sessão.
3. Volte como **Lia**. Inicie o treino, registre as repetições e a carga por série e conclua. Cadastre outra medição.
4. Para experimentar a troca, copie o código de Lia e entre como **Caio**. Envie o convite. Como Lia, confirme o compartilhamento e a substituição de Ana.
5. Compare as duas contas profissionais. Caio consulta o histórico autorizado. Ana perde o acesso. Lia ainda pode executar a ficha publicada por Ana.

A interface usa formulários técnicos para demonstrar os fluxos. A identidade visual final segue em uma frente própria. O ensaio local aceita somente as três identidades fictícias. O cadastro por e-mail e senha usa o Supabase no ambiente configurado.

## Executar os testes

```sh
npm test
```

O comando compila as aplicações e executa a integração contra um PostgreSQL novo com credenciais de banco restritas. Para executar também a jornada no navegador, instale o Chromium do Playwright e rode o teste abaixo. A variável opcional CHROMIUM_PATH aceita o executável de um Chromium já instalado.

```sh
npx playwright-core install chromium
npm run test:browser
```

## Conteúdo técnico

| Arquivo ou pasta | Conteúdo |
|---|---|
| docs/01-produto-e-decisoes.md | PRD, escopo do MVP, premissas e decisões delegadas |
| docs/02-historias-e-fluxos.md | Histórias com aceite e regras operacionais |
| docs/03-arquitetura-e-dados.md | Arquitetura, ER, dicionário das 40 entidades e integridade |
| prisma/schema.prisma e prisma/migrations/ | Modelo físico e quatro migrações ordenadas |
| docs/openapi.json e docs/04-contratos.md | Contrato OpenAPI 3.1 das rotas reais e contratos das próximas entregas |
| docs/05-seguranca-e-operacao.md | Autenticação, LGPD, riscos, implantação, recuperação e escala |
| docs/06-roadmap-e-validacao.md | Backlog, sprints, modelo SaaS e pesquisa de mercado proposta |
| docs/07-evidencias.md | O que foi executado e cobertura da baseline |
| apps/api, apps/web e packages/contracts | Backend, frontend e validações compartilhadas |
| scripts e tests | Demonstração, privilégios SQL, OpenAPI e testes automatizados |

## Manter dados em um ambiente próprio

Use um banco de desenvolvimento vazio e um projeto Supabase Auth seu. O guia operacional descreve as credenciais distintas para migrações e API, os privilégios SQL e as chaves públicas do cliente. A demonstração cria uma instância independente. Todos os dados de exemplo são fictícios.

As referências do projeto de 12/11/2026 são MLG-001 v1.0, PH-RN-001, ARQ-001 v1.0 e o prompt mestre de arquitetura. A versão 0.1.0 identifica o software. MLG-001 continua sendo a versão do modelo lógico.
