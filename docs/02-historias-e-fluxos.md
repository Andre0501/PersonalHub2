# Histórias, critérios de aceite e fluxos

## Histórias priorizadas

| ID | Como usuário, quero… | Critério verificável | Situação |
|---|---|---|---|
| US-01 | Como aluno, usar minha conta sem personal | Concluído o cadastro STUDENT, posso registrar peso e consultar apenas os meus lançamentos | Implementado |
| US-02 | Como personal, convidar pelo código do aluno | Um código conhecido ou desconhecido recebe a mesma resposta imediata. Um segundo convite vigente do mesmo par não duplica o registro | Implementado |
| US-03 | Como aluno, decidir o compartilhamento | A solicitação é minha, está vigente e inclui a versão aceita do aviso. Sem aceite explícito, nenhuma permissão é concedida | Implementado |
| US-04 | Como aluno, trocar de personal conscientemente | A confirmação identifica A. Se B estiver sem vaga, o acesso e a agenda de A continuam como antes. Se B for ativado, A perde acesso na mesma transação | Implementado |
| US-05 | Como aluno, revogar o acesso | O personal perde acesso a novas consultas. Registro de consentimento, encerramento e classificação das sessões recebem uma confirmação comum | Implementado |
| US-06 | Como personal, publicar meu treino | Somente meu catálogo pode alimentar meu rascunho. Publicar cria versão fixa, ordem, instruções e métricas das séries | Implementado |
| US-07 | Como aluno, executar uma ficha publicada | A execução aceita somente minhas séries prescritas. Conclusão exige um resultado de cada série. Abandono distingue o que ficou pendente | Implementado |
| US-08 | Como aluno, corrigir um treino | Requer minha execução concluída, revisão esperada e motivo. A revisão anterior continua íntegra | Implementado pela API |
| US-09 | Como aluno, corrigir ou invalidar meu peso | Correção parte da versão atual. Invalidação exige motivo. Só eu modifico o registro. O personal autorizado consulta os pesos ativos | Implementado pela API |
| US-10 | Como personal, organizar a agenda | Sessões adjacentes são permitidas. Interseções para o aluno ou para o personal são rejeitadas mesmo sob concorrência. Alterar sessão terminal é rejeitado | Implementado |
| US-11 | Como aluno, consultar meu histórico de sessões e questionar um desfecho | Vejo o histórico dos meus vínculos. Uma contestação pertence ao participante correto e a sua decisão não reabre a sessão | Consulta implementada. Contestação planejada |
| US-12 | Como personal, publicar avaliações e notas | Avaliação publicada inclui unidade, método pertinente e autoria. Correção gera nova revisão e exige vínculo válido com o autor original | Modelo entregue. API planejada |
| US-13 | Como aluno, manter meu diário alimentar | Refeição e itens confirmam juntos. Cada quantidade tem unidade e uma correção preserva a versão anterior. Personal pode ler com permissão | Modelo entregue. API planejada |
| US-14 | Como personal, manter meu trabalho após downgrade | Cota é conferida no novo aceite. Excedentes existentes continuam ativos. A leitura básica autorizada permanece disponível | Cota e fallback implementados. Cobrança planejada |
| US-15 | Como titular, exercer meus direitos | Pedido é verificado e rastreável. Atendimento só termina após verificar as ações necessárias, dependências, cópias e informação de terceiros | Modelo e fluxo definidos. Operação planejada |
| US-16 | Como operador autorizado, resolver uma contestação | Identidade privilegiada, fundamento e autoridade sobre o escopo são revalidados e ligados ao evento canônico | Planejado |
| US-17 | Como usuário, retomar um envio após perda de resposta | A mesma chave e intenção recuperam o recibo confirmado. Mudar os parâmetros com a mesma chave gera conflito | Implementado |

## Fluxo de vínculo

1. O aluno compartilha seu código fora da plataforma. Só o personal inicia o convite. Um convite pendente dura exatamente 168 horas.
2. O aluno lê a finalidade, os dados compartilhados e o nome do profissional. Pode recusar. Na troca, identifica e confirma também o vínculo que será encerrado. O personal pode cancelar o seu convite pendente.
3. A API verifica destinatário, estado, vencimento, disponibilidade do personal, cota e vínculo esperado no ponto de confirmação.
4. O aceite grava GRANTED, vínculo, estado ACCEPTED e auditoria. Uma troca também encerra o vínculo anterior, registra sua revogação, trata a agenda e invalida outras solicitações concorrentes. Uma falha desfaz o conjunto.
5. A autorização é consultada a cada leitura protegida. A instituição de um novo vínculo não transfere autoria e uma sessão histórica não dá acesso aos registros do aluno.

| Estado em um instante T de encerramento | Destino | Efeito no histórico |
|---|---|---|
| SCHEDULED e starts_at ≥ T | ARCHIVED | LINK_ENDED_FUTURE |
| SCHEDULED e starts_at < T < ends_at | ARCHIVED | LINK_ENDED_INTERRUPTED |
| SCHEDULED e ends_at ≤ T | CLOSED_UNRESOLVED | Fica sem conclusão presumida |
| Sessão com estado terminal | Mantém o estado registrado | Mantém os eventos anteriores |

## Treino e evolução

O personal seleciona exercícios do seu catálogo e publica o rascunho. Cada versão guarda a prescrição completa, mesmo que o catálogo seja alterado depois. A autoria e o vínculo de origem são fixos. O aluno inicia uma execução da versão destinada a ele. O envio final identifica as séries, repetições, carga, duração ou distância. Uma série pulada tem estado próprio. Uma finalização incompleta pode ser registrada como abandono. A primeira revisão guarda prescrição e resultados. Correções subsequentes avançam a cadeia. Apenas o aluno pode corrigir seus resultados.

O peso também começa com uma revisão. O valor usa quilogramas positivos com duas casas decimais. O aluno pode informar data de medição e nota. A invalidação retira o peso da consulta profissional e preserva os registros do titular. Na evolução futura, comparações de medidas só combinarão definições, unidades e métodos compatíveis.

## Fluxos da próxima entrega

| Processo | Sequência e controles |
|---|---|
| Avaliação e nota | Rascunho privado do autor → validar vínculo e campos → publicar snapshot → corrigir com revisão. A invalidação requer justificativa |
| Alimentação | Aluno registra refeição e itens → validar unidades e quantidades → criar revisão inicial → consulta do aluno ou personal autorizado → correção versionada |
| Contestação | Aluno abre disputa sobre sua sessão → verificar se já existe uma em aberto → decisão administrativa fundamentada e auditada → manter o estado terminal da sessão |
| Assinatura | Seleção de oferta versionada → checkout de teste → receber notificação → confirmar o estado no provedor → aplicar evento uma vez → reconciliar em caso de resultado indeterminado |
| Direitos e encerramento | Receber e verificar titular → delimitar solicitação e identificar terceiros → restringir acesso quando aplicável → executar ou justificar cada destinação → verificar evidências e comunicar o resultado |
