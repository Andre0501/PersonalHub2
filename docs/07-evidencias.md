# Evidências da versão 0.1.0

Execução em 19 de novembro de 2026 com dados fictícios. As dependências exatas estão em package-lock.json. A suíte roda contra um PostgreSQL temporário iniciado na máquina, migrações aplicadas pelo Prisma e uma credencial de runtime com as permissões de scripts/runtime-grants.sql.

| Verificação | Resultado |
|---|---|
| Schema e banco | Prisma validou 40 modelos. Quatro migrações aplicadas em um banco novo. PostgreSQL 18.7 com restrições, relações e triggers executando de fato |
| Build | Prisma Client gerado. TypeScript compilou o backend e verificou o cliente. Vite gerou o frontend |
| Contrato | 34 operações em 30 caminhos sob /v1. Métodos e caminhos confrontados com os controladores. Esquemas de entrada e saída conferidos com JSON Schema 2020-12 |
| Integração | 26 testes aprovados, zero falhas e zero ignorados |
| Navegador | Um teste aprovado no Chromium 153 em largura de 420 px, com SDK Supabase, API e banco reais do laboratório e um emissor local ES256/JWKS |
| Dependências de produção | npm audit --omit=dev retornou zero alertas na consulta de 19/11/2026 |
| Pacote distribuído | Instalado por npm ci em uma extração limpa e exercitado com as duas suítes |
| Dependências principais verificadas | Node 24.22.3, NestJS 11.2.11, Prisma 7.10.1, React 19.3.1, TypeScript 5.9.3, SDK Supabase 2.119.2 |

## Casos exercitados

A suíte tests/integration.test.mjs contém cenários que percorrem os recursos por HTTP. Quando um cenário precisa de data vencida, estado financeiro, conta suspensa ou falha de auditoria, altera uma fixture pelo login de preparação e exercita a API com o login restrito. As asserções conferem os efeitos no banco. A suíte tests/browser.test.mjs percorre a interface.

| Grupo | Comportamentos observados |
|---|---|
| Identidade e convite | Entrada pública de saúde, sessão inválida, assinatura adulterada rejeitada, issuer e audience errados rejeitados, cadastro concorrente idempotente, papel exclusivo, e-mail de outra identidade, código opaco, convites repetidos, recusa/cancelamento, vencimento em 168h e limite horário |
| Autorização e troca | Peso independente, acesso de terceiros recusado, duas aceitações concorrentes, confirmação do vínculo esperado, bloqueio do anterior, invalidação de convites concorrentes, rollback quando o destino está lotado e disputa pela última vaga |
| Auditoria e evolução | Replay concorrente, reuso incompatível da chave, recibo sem medida corporal, rollback por falha no INSERT da auditoria, retificação de peso com motivo opcional, invalidação motivada, cadeia imutável, paginação e resposta no-store |
| Agenda | Sobreposição concorrente, horários adjacentes, dono da sessão, fuso inválido, remarcação com versão, imutabilidade após estado terminal, classificação de sessões futuras, em andamento e passadas em T único |
| Prescrição e exercício | Catálogo de terceiros isolado, rascunho privado, publicação concorrente, preservação da primeira versão, execução de ficha antiga após troca, correção de resultado, rejeição de série alheia ou duplicada, abandono explícito |
| Banco e planos | Runtime sem DELETE e sem acesso aos módulos fechados, cota Free, PAST_DUE com leitura preservada, conta suspensa, constraint diferida contra aceite isolado, quebra da sequência de revisões recusada |
| Jornada no navegador | Lia aceita o convite, Ana publica a ficha, Lia registra repetições, carga e série pulada, lança peso e revoga. Ao retornar como Ana, a medição deixa de aparecer. O cache tem somente /offline.html |

## Rastreabilidade com o catálogo HOM da MLG-001

| Cenários lógicos | Cobertura nesta entrega | Evidência que ainda falta |
|---|---|---|
| HOM-01 a HOM-05, comercial | Free canônico e assinatura corrente têm proteções no banco. O comportamento de PAST_DUE foi exercitado após preparação do estado | Ciclo completo de oferta, mudança de vigência, migração de assinatura e eventos reais ou de sandbox do provedor |
| HOM-06 e HOM-07 | Aceites concorrentes e falha da troca por capacidade foram reproduzidos com transações reais | Repetir sob carga representativa |
| HOM-08 e HOM-09 | Conta suspensa e acesso após revogação cobertos. Operações profissionais dependem do lock de vínculo | Corrida com encerramento real de conta e teste dirigido de revogação durante operação longa |
| HOM-10 e HOM-11 | Exercícios/séries cruzados são restringidos e o comando rejeita IDs fora da versão. Peso e treino têm revisões imutáveis e pertencimento físico | Completar matriz de referências cruzadas para avaliações, notas e refeições |
| HOM-12 e HOM-13 | Agendamento simultâneo e sessão passada sem desfecho verificados | Medir latência com carga de piloto |
| HOM-14 e HOM-15 | Entidade de disputa representada | Validar autoridade privilegiada e decisão administrativa com sessão terminal preservada |
| HOM-16 a HOM-18 | Replay, conflito de parâmetros e falha de auditoria com rollback reproduzidos | Repetir com falha de rede real e falha do nó da API |
| HOM-19 a HOM-28 | Governança e referências de evidência modeladas | Webhook duplicado, resultado externo desconhecido, destinação, exportação, expiração de evidência, restauração e encerramento |

O ensaio não usou credenciais de um projeto Supabase hospedado. Confirmação e recuperação por e-mail, rotação de chave, PSP, testes de carga, revisão jurídica, observação de mercado e implantação comercial pertencem às etapas seguintes. A prova técnica local mede o comportamento identificado acima.
