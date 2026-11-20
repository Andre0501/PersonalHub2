# Backlog, sprints e estratégia SaaS

## Sequência do MVP

Estimativa de planejamento com sprints de duas semanas para uma equipe pequena. As dependências e critérios de saída orientam a sequência. O tempo do piloto, disponibilidade de pessoas e integrações externas alteram o calendário.

| Prioridade / sprint | Resultado para o usuário | Dependências | Evidência de saída |
|---|---|---|---|
| P0 • S0, entrega 0.1 | Cadastro, vínculo, peso, agenda, publicação de ficha e execução de séries em ambiente local | Baseline MLG-001 e stack definida | Banco recriado pelas migrações, comandos concorrentes exercitados e jornada no navegador |
| P0 • S1, próxima | Aluno e personal usam avaliações, medidas e notas compartilhadas. Aluno mantém diário alimentar | ML-003/004, regras de autoria e snapshot já presentes | Autor publica e corrige. Sucessor lê sem editar. Aluno registra refeição com itens. Falhas mantêm revisões íntegras |
| P0 • S2 | Fechar ciclo de treino e acesso real | Supabase próprio de homologação e guia de identidade visual | Recuperação de senha, ensaio com dois dispositivos, salvamento parcial da execução, teste de acessibilidade e visual definitivo revisado |
| P0 • S3 | Atender contestação, privacidade e encerramento | Identidade privilegiada, matriz por categoria, canal de atendimento | Decisão rastreável sem reabrir sessão, exportação íntegra e simulação de restauração com reaplicação de destinação |
| P1 • S4 | Experimentar compra e mudança de plano | Conta de teste do PSP, ofertas e entitlements versionados | Webhook duplicado não duplica efeitos, inadimplência aplica Free, reconciliação de timeout e downgrade preservam leitura |
| P0 para abertura • S5 | Piloto controlado com dados reais | Resultados de segurança, privacidade, recuperação e testes de usabilidade | Fluxo completo real em homologação, responsáveis operacionais definidos e correções críticas concluídas |
| Após evidência | Acesso simultâneo de vários profissionais, integrações e análises avançadas | Necessidade observada e novo modelo de permissão | Protótipo de autorização por par e escopo. Testes de autoria, agenda e revogação seletiva antes de migrar cardinalidade |

## Backlog priorizado da próxima sprint

| Ordem | Item | Critérios de pronto |
|---|---|---|
| 1 | Catálogo de definições e avaliação tipada | Código imutável após publicação, valor coerente com o tipo, unidade canônica, contexto e método quando exigidos |
| 2 | Publicar, retificar e invalidar avaliação | Autor e vínculo válidos, motivo em invalidação, revisão e auditoria atômicas e leitura histórica permitida |
| 3 | Notas compartilháveis | Rascunho só do autor. Aluno lê publicação e personal sucessor consulta sem editar autoria |
| 4 | Refeições e itens do aluno | Quantidade positiva, unidade explícita, ordem estável, revisão inicial e correção com controle de concorrência |
| 5 | Testar isolamento e regressão | Verificar outros alunos, sucessor, autoria antiga, revisão alheia e falha atômica. Adicionar cenários ao pipeline |
| 6 | Documentar a API entregue | Tipos de entrada e saída, exemplos e códigos adicionados ao OpenAPI. Demonstrador usa os endpoints reais |

## Oferta e validação comercial

| Oferta | Decisão de produto | Situação |
|---|---|---|
| Aluno | Gratuito com acesso aos próprios dados, inclusive sem personal | Implementado no núcleo |
| Free personal | Até 3 alunos ativos, fluxo básico de prescrição, agenda e histórico. O limite é revalidado no aceite | Implementado para o piloto técnico |
| Pro personal | Experimento com até 30 alunos ativos e R$ 39,90/mês. Testar prioridade de relatórios e gestão ampliada | Hipótese interna, preço não publicado, sem cobranças |
| Inadimplência | PAST_DUE utiliza direitos da oferta Free canônica. Acima da cota, preserva os ativos e bloqueia nova ativação | Regra de autorização testada por fixture. Transição financeira via PSP pendente |
| Distribuição | Primeiros convites por relacionamento com profissionais independentes que consentirem participar | Canal proposto, sem recrutamento ou validação comercial realizada |

O primeiro adaptador planejado é Mercado Pago Assinaturas. O domínio utiliza referências do provedor para deduplicação e consulta o evento canônico antes de aplicar efeitos. Precificação, taxas efetivas do PSP e encargos do negócio entram no cálculo da margem apenas quando houver dados reais. O experimento mede receita líquida por personal contra custo de infraestrutura, cobrança e suporte. [Mercado Pago, Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview)

## Pesquisa e critérios de decisão

1. Entrevistar 5 personais independentes e 5 alunos sobre a última semana de treino. Pedir exemplos concretos de como prescreveram, registraram cargas e recuperaram dados anteriores. Registrar frequência dos problemas e ferramentas usadas.
2. Observar 5 duplas com dados fictícios realizando convite, registro de carga e revogação sem instrução individual. A meta inicial de usabilidade é que 4 das 5 duplas completem a jornada sem intervenção crítica. Qualquer leitura indevida impede avançar para dados reais.
3. Conduzir piloto de quatro semanas após homologação. Medir ativação como duplas com primeira execução registrada em até sete dias dividido por duplas com convite aceito. Medir retenção na semana 4 como personais ativados que voltaram a usar com um aluno dividido pelos ativados na primeira semana.
4. Registrar objeções e testar o preço de R$ 39,90 com a mesma descrição dos benefícios. Distinguir intenção declarada, opção por piloto e assinatura efetivamente paga. A meta exploratória é obter pelo menos duas escolhas concretas do Pro entre participantes elegíveis. A amostra orienta o próximo teste e não estima o mercado brasileiro.
5. Analisar abandono por etapa e motivos em entrevistas. Se alunos aceitam o convite e não registram o treino, priorizar tempo de registro por série. Se o uso se repete e o Pro não converte, rever a diferenciação ou o preço antes de ampliar aquisição.

## Ensaios antes de produção

Em homologação, exercitar 20 personais com 5 alunos sintéticos cada usando uma oferta de teste adequada. Repetir leitura de histórico e confirmação de treino com 20 usuários simultâneos por 15 minutos. Medir p50 e p95, throughput, erros, espera por locks e uso do pool. As metas iniciais são p95 de leitura até 500 ms e taxa de erro inesperado abaixo de 1%. Registrar o ambiente, a carga e o critério de aceitação. Os testes de concorrência da versão 0.1 verificam correção e não constituem esse teste de carga.

Os resultados de mercado, a homologação externa, o teste de carga, a auditoria operacional e a revisão jurídica pertencem ao piloto. As decisões técnicas desta versão permitem executá-los com critérios objetivos.
