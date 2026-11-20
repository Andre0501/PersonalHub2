# API REST e integração

O contrato executável está em docs/openapi.json, OpenAPI 3.1. Sua URL base é /v1. A configuração local usa a porta 3008. O laboratório escolhe portas temporárias automaticamente. O arquivo contém método, rota, dados de entrada e saída, estados de erro, parâmetros de paginação e segurança. A origem do contrato é scripts/openapi.mjs com as entradas compartilhadas de packages/contracts.

## Autenticação e consistência

Apenas GET /health é pública. As demais chamadas exigem Authorization com esquema Bearer e um access token do projeto configurado. Todo POST, PUT ou PATCH exige Idempotency-Key, UUID novo para cada intenção. Um retry da mesma intenção reutiliza a mesma chave. Dados de negócio nunca são aceitos como prova de identidade.

| Situação | Código HTTP | Comportamento do cliente |
|---|---|---|
| Cadastro concluído ou comando de estado confirmado | 200 | Atualizar a projeção com GET |
| Recurso criado | 201 | Guardar o identificador do recibo |
| Convite recebido para processamento | 202 | O retorno imediato é uniforme para códigos válidos ou desconhecidos |
| Entrada inválida ou campo inesperado | 400 | Corrigir os dados. Conferir intervalo, unidade, aviso e formato |
| Identidade ausente ou JWT inválido | 401 | Renovar sessão ou voltar ao login |
| Papel, estado de conta ou assinatura incompatível | 403 | Exibir o motivo retornado. PROFILE_REQUIRED leva ao cadastro de perfil |
| Objeto fora da visibilidade do ator | 404 | Tratar o objeto como indisponível |
| Conflito de revisão, cota, agenda ou chave | 409 | Recarregar o estado. Uma mudança de intenção usa chave nova |
| Convite vencido | 410 | Personal pode enviar outro convite |
| Limite de convites | 429 | Aguardar a janela horária |
| Dependência indisponível ou falha interna | 503 ou 500 | Preservar a mesma chave e repetir a mesma intenção após recuperação |

## Catálogo das operações entregues

| Recurso | Operações reais |
|---|---|
| Saúde, perfil e aviso | GET /health, GET e POST /me, GET /consent-notice |
| Vínculos | GET e POST /link-requests, POST /link-requests/{id}/accept, /decline e /cancel, GET /links, POST /links/{id}/end e /revoke |
| Peso | POST /me/weights, GET /students/{id}/weights, PATCH /me/weights/{id}, POST /me/weights/{id}/void, GET /me/weights/{id}/revisions |
| Agenda | GET e POST /links/{id}/appointments, PATCH /appointments/{id}, POST /appointments/{id}/resolve |
| Catálogo e ficha | GET e POST /exercises, POST /links/{id}/plans, GET /links/{id}/drafts, PUT /plans/{id}/draft, POST /plans/{id}/publish |
| Treino publicado e execução | GET /students/{id}/workouts, GET /workout-versions/{id}, POST /workout-versions/{id}/executions, GET /students/{id}/executions, GET /executions/{id}, POST /executions/{id}/finish e /corrections |

## Exemplo de integração com valores fictícios

O personal envia POST /link-requests com o código recebido diretamente do aluno. O aluno consulta GET /link-requests, identifica o convite pelo nome da contraparte e lê GET /consent-notice. Em um primeiro vínculo, o corpo de POST /link-requests/{id}/accept é o seguinte.

```json
{"consent":true,"noticeVersion":"acompanhamento-v1","expectedActiveLinkId":null}
```

Em uma troca, expectedActiveLinkId contém o identificador do vínculo visualizado e confirmado pelo aluno. Se a tela estiver defasada, a API retorna LINK_CHANGED. O recibo de sucesso contém linkId. O servidor calcula o momento de confirmação após serializar os recursos relevantes.

Para prescrever, o personal cadastra o exercício com POST /exercises. O id retornado entra em POST /links/{id}/plans. Um exemplo de corpo com duas séries é apresentado abaixo.

```json
{
  "title": "Treino A",
  "exercises": [{
    "exerciseId": "878c44a4-867a-4021-9b99-07cbd51e13d1",
    "sets": [{"reps":10,"loadKg":12.5},{"reps":8,"loadKg":15}]
  }]
}
```

O personal publica pela revisão do rascunho. O aluno inicia a execução e consulta GET /executions/{id} para obter os identificadores das séries prescritas. No encerramento, o corpo carrega o resultado explícito de cada série.

```json
{
  "expectedRevision": 1,
  "outcome": "COMPLETED",
  "sets": [
    {"prescribedSetId":"a6ef964c-0b15-40ab-8239-ce63aa813ea3","status":"COMPLETED","reps":9,"loadKg":12.5},
    {"prescribedSetId":"6e069842-aeec-4276-a85c-33ddd9567827","status":"SKIPPED"}
  ]
}
```

Uma prescrição admite até 12 exercícios e 12 séries por exercício por operação nesta versão. Cada série prescrita tem pelo menos uma métrica. Cada série efetivamente realizada exige pelo menos uma métrica real. Na correção de treino concluído, a lista é completa e o motivo é obrigatório. Um aluno independente pode fazer POST /me/weights com kg e measuredAt e ler seu histórico usando o profileId retornado por GET /me.

## Contratos reservados às próximas entregas

| Domínio | Contrato planejado | Condição para habilitar |
|---|---|---|
| Avaliações | POST /links/{id}/assessments e POST /assessments/{id}/publish ou /corrections | Autoria, vínculo de origem, métrica e unidade compatíveis, revisão imutável |
| Alimentação | POST /me/meals, PATCH /me/meals/{id}, GET /students/{id}/meals | Titularidade, itens e snapshot no mesmo commit. Impedir edição profissional |
| Disputas | POST /appointments/{id}/disputes e POST /admin/disputes/{id}/resolve | Titular da sessão, disputa aberta única e autoridade administrativa no commit |
| Assinatura | POST /me/subscription/checkout e POST /billing/webhooks/mercadopago | Sandbox, assinatura da notificação, deduplicação do evento, consulta canônica e reconciliação |
| Direitos | POST /me/privacy/requests, GET /me/privacy/requests/{id} e POST /me/closure | Verificação de titular, dependências de terceiros e evidência de conclusão |

As rotas desta última tabela servem ao planejamento e não integram o documento OpenAPI das rotas executáveis.
