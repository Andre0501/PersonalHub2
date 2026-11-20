# PRD e decisões de implantação

**PersonalHub • MVP web responsivo • Brasil • versão 0.1.0 do software**

## Problema, proposta e usuários

Um aluno que troca de profissional precisa consultar as fichas, cargas, medidas e sessões anteriores. O profissional que assume precisa entender o que já foi feito, respeitar a autoria e receber autorização explícita. O PersonalHub concentra esse acompanhamento em uma conta do aluno que também funciona de forma independente. A frequência, a gravidade do problema e a disposição a pagar são hipóteses de pesquisa.

O cliente pagante previsto é o personal independente. Ele cadastra seus próprios exercícios, publica fichas, acompanha a execução e opera a agenda. O aluno mantém seu cadastro gratuito, lança os dados pessoais e decide com quem compartilhar o histórico. O primeiro indicador de valor é a dupla que conclui o percurso convite aceito → ficha publicada → treino registrado.

## Escopo e resultado esperado

| Área | Entrega executável 0.1 | MVP comercial a completar |
|---|---|---|
| Identidade e vínculo | Dois perfis exclusivos, convite, aceite, recusa, cancelamento, troca e revogação | Homologar e-mails de confirmação, recuperação e entrega com o provedor real. Operacionalizar suspensão e fechamento |
| Prescrição e execução | Catálogo por autor, rascunho, publicação, conclusão ou abandono, histórico e correções de execução por API | Completar edição de catálogo, arquivamento, experiência de treino, salvamento parcial por série e acessibilidade no dispositivo |
| Acompanhamento | Peso independente com revisões e invalidação. Histórico disponível ao personal autorizado | Avaliações, medidas tipadas, notas compartilhadas e evolução com comparabilidade por método |
| Alimentação | Estrutura de refeições, itens e revisões | Diário simples do aluno, edição e invalidação com preservação de versões |
| Agenda | Marcar, remarcar, cancelar, registrar conclusão ou ausência e tratar sessões na troca | Contestação do aluno e decisão privilegiada auditada |
| Comercial e governança | Cadastro Free, cota no aceite, regra de fallback para PAST_DUE, auditoria e recibos idempotentes | Cobrança, conciliação, direitos do titular, encerramento, matriz de retenção e restauração verificada |
| Web | Cliente React para percorrer as jornadas e página pública offline | Dashboards por papel, visual definitivo, instalação nos dispositivos-alvo e fluxo de recuperação de sessão |

Uma ficha publicada pelo personal A permanece executável pelo aluno depois da troca para B. Um dado de autoria de A mantém essa atribuição. Notas privadas, análise clínica, prescrições alimentares, séries extras, marketplace, sincronização de wearables e aplicativo nativo ficam para avaliação posterior. O diário do MVP registra o que o aluno relata.

## Decisões adotadas por delegação

| Decisão | Escolha operacional | Fundamento e condição para rever |
|---|---|---|
| AD-01 • Múltiplos vínculos | Histórico com vários personais. Um único ACTIVE por aluno no MVP. A confirmação identifica o vínculo que será substituído | ARQ-001 ADR-004/005, RN-001-12/13 e GL-I03/I07. Atuação simultânea de dois profissionais exigiria uma nova versão com escopos por profissional, calendário e concorrência próprios |
| AD-02 • Identificação | Identidade Supabase separada do UUID de domínio. Aluno fornece ao personal um código UUID aleatório de compartilhamento | Evita pesquisa pública por telefone, CPF ou e-mail. O código só abre a possibilidade de convite |
| AD-03 • Acesso | Um aceite libera o conjunto de histórico compartilhável especificado no aviso da versão. Revogar o consentimento funcional encerra o vínculo | O novo profissional pode ler material anterior publicado. Rascunhos e catálogo profissional ficam isolados. Uma mudança de finalidade requer aviso versionado e regra de transição explícita |
| AD-04 • Persistência | Monólito NestJS, PostgreSQL e Prisma no mesmo monorepo do React. Instantes UTC, fuso IANA, quilogramas e identificadores UUID | A troca e as revisões envolvem vários agregados que precisam confirmar juntos |
| AD-05 • Concorrência | Transação por comando, locks por estudante e personal, restrições no banco e revisão esperada | Duas telas abertas não podem fazer a mesma vaga ou a mesma revisão valer duas vezes |
| AD-06 • Planos | Aluno gratuito. Free de piloto com até 3 alunos ativos. O Pro de 30 vagas por R$ 39,90/mês é uma hipótese de teste | Free tem oferta versionada no banco. O Pro depende de teste de preço e integração de cobrança. Nova oferta recebe versão própria |
| AD-07 • Suspensão | Conta suspensa perde o uso operacional. A suspensão apenas comercial bloqueia novas operações profissionais, enquanto a leitura básica depende de vínculo e conta ativos | PAST_DUE usa imediatamente a capacidade Free e preserva vínculos existentes. Ações que suspendem ou reativam contas integrarão governança |
| AD-08 • Aluno no encerramento | A sessão passada pendente termina CLOSED_UNRESOLVED. Futuras e em andamento são arquivadas com motivos distintos | Protege o histórico de uma inferência incorreta de ausência. A agenda independe de executar o treino |
| AD-09 • Operação e governança | Atos privilegiados terão identidade separada, MFA, escopo por recurso e registro de autoridade. Compras deverão passar por um adaptador Mercado Pago | Nenhum papel ADMIN em users. Integrações pagas e destinação destrutiva seguem em desenvolvimento |
| AD-10 • PWA e privacidade | Registros pessoais vêm da API autenticada. O cache offline da versão 0.1 contém uma página pública | Evita persistir medições e treinos num computador compartilhado. Operações offline exigirão um desenho próprio |
| AD-11 • Evolução do produto | Primeira validação de usabilidade com dados fictícios. Promoção por evidências de uso, repetição e disposição a pagar | O desenho técnico pode ser decidido agora. Adoção, preço e conformidade dependem de evidências externas |

## Requisitos de qualidade e responsabilidades

O MVP prioriza integridade na troca, isolamento entre alunos, reexecução segura após timeout e recuperação rastreável. As metas de homologação incluem zero leitura de terceiro nos casos de autorização, zero estado parcial nos cenários transacionais e resposta p95 inferior a 500 ms para consultas comuns no ensaio especificado no roadmap. A meta de tempo ainda precisa ser medida. Engenharia responde por integridade e observabilidade, produto pela pesquisa e pelas ofertas, operações pela restauração e o responsável por privacidade pela aplicação das políticas e pelo atendimento ao titular.
