export const APP_SUPPORT_KNOWLEDGE = `## Base de atendimento do app CDMF

### Objetivo desta base
- Esta base serve para orientar atendimento humano e também o chatbot sobre como o app funciona para alunos e professores.
- Priorize respostas práticas: explique o que o usuário vê no app, o que ele precisa fazer e em qual tela resolver cada situação.
- O atendimento acontece no próprio número oficial do Centro de Danças Marcelo Ferreira, então a comunicação deve soar como atendimento direto da escola.

### Perfis e acesso
- Aluno entra pelo fluxo "Sou aluno" e faz login com conta Google.
- Professor entra pelo fluxo "Sou professor" com código e senha.
- Se professor esquecer a senha, a orientação é entrar em contato com a administração para recuperar o acesso.

### Primeiro acesso do aluno
- Depois do login com Google, o aluno precisa confirmar o número de WhatsApp para continuar usando o app.
- A confirmação é feita com código enviado por WhatsApp.
- No onboarding completo, o app também coleta data de nascimento, gênero e preferência na dança.
- Se o aluno já tinha conta, mas o telefone não está validado pelo método atual, o app pede apenas a revalidação do WhatsApp.
- Se o aluno alterar o telefone depois, a verificação anterior deixa de valer e o número precisa ser verificado novamente.

### Estrutura principal do app do aluno
- O aluno usa quatro áreas principais: Início, Aulas, Pagamentos e Conta.
- No desktop, essas áreas aparecem em layout lateral; no mobile, em abas.

### Área Início
- Mostra avisos e informações gerais do CDMF.
- Mostra turmas do aluno e eventos ativos.
- Também concentra convites para eventos e alguns alertas importantes, como matrícula desativada.
- Se a conta anterior do aluno tiver sido removida do sistema, o app mostra uma orientação para falar com a escola pelo WhatsApp.
- Se a matrícula estiver inativa, o app informa isso e oferece contato pelo WhatsApp para regularização ou reativação.

### Área Aulas
- Mostra apenas as turmas em que o aluno está matriculado.
- Cada turma exibe nome, professor e próxima aula com dia e horário.
- O aluno consegue abrir ações rápidas para:
- avisar que não poderá ir à aula
- falar sobre a aula com o professor
- solicitar saída da turma
- Se o aluno não estiver em nenhuma turma, o app orienta a entrar em contato para novas inscrições.
- Há atalhos de WhatsApp para novas matrículas e dúvidas sobre horários, faltas e rotina das aulas.

### Área Pagamentos
- Reúne mensalidades, ingressos de eventos e vouchers.
- O aluno pode abrir uma cobrança para ver detalhes e pagar com PIX.
- Quando existe PIX disponível, o app permite:
- copiar o código PIX
- ver o QR Code
- verificar se o pagamento foi confirmado
- gerar um novo PIX quando necessário
- Status comuns de cobrança:
- pending: cobrança pendente
- overdue: cobrança vencida
- paid: pagamento confirmado
- cancelled: cobrança cancelada
- O app também mostra vouchers válidos do aluno, especialmente para eventos.
- Existem atalhos de suporte para casos como problema no pagamento, valor incorreto e dúvidas financeiras.

### Fluxo de eventos para o aluno
- Os eventos aparecem na área Início.
- Evento gratuito:
- ao confirmar participação, a presença pode ser confirmada imediatamente
- Evento pago:
- ao participar, o app gera um ingresso/cobrança
- a presença só fica confirmada depois do pagamento
- Depois que o pagamento do evento é confirmado, o aluno precisa gerar o voucher de entrada.
- O voucher é o comprovante de entrada no evento e pode ser aberto pelo card do evento ou pela área de pagamentos.
- Se o aluno já estiver confirmado no evento, mas ainda sem ingresso, o app pode permitir gerar o ingresso retroativamente.
- Se o aluno cancelar a participação, o app tenta remover a participação, apagar cobrança pendente e excluir voucher relacionado quando existir.

### Acompanhante em evento
- Quando o aluno já tem voucher principal, o app pode permitir levar acompanhante.
- Existem dois caminhos:
- o próprio aluno gera uma cobrança PIX para o acompanhante
- o aluno envia um convite pelo WhatsApp para a outra pessoa criar conta, confirmar presença e pagar o próprio ingresso
- Depois do pagamento do acompanhante, ele também recebe voucher próprio.

### Área Conta
- O aluno pode consultar e editar:
- telefone
- data de nascimento
- gênero
- preferência na dança
- A área Conta também permite:
- abrir as políticas e termos
- trocar a conta Google
- sair da conta
- Se o aluno precisa corrigir dados pessoais, normalmente isso é feito pela área Conta.

### Situações comuns e orientação correta
- Não recebi o código de WhatsApp:
- confirmar se o número foi digitado com DDD e se o WhatsApp desse número está ativo
- orientar a reenviar o código
- Não consigo entrar como aluno:
- confirmar se a pessoa escolheu "Sou aluno" e tentou entrar com a conta Google correta
- Professor não consegue entrar:
- confirmar código e senha; se esqueceu a senha, orientar contato com a administração
- Não estou vendo minhas turmas:
- verificar se a matrícula do aluno está ativa e se ele está vinculado a alguma turma
- Não consigo participar do evento:
- verificar se o evento é gratuito ou pago
- se for pago, conferir se o ingresso foi gerado e se a cobrança foi paga
- Paguei o evento, mas não apareceu confirmação:
- orientar a verificar a área Pagamentos e depois gerar o voucher, se o pagamento já constar como confirmado
- Não encontrei meu voucher:
- verificar se o pagamento do ingresso foi confirmado; sem pagamento confirmado, o voucher pode não estar disponível
- Valor da cobrança parece errado:
- orientar a usar o atalho de suporte financeiro ou falar com a secretaria informando qual cobrança está incorreta
- Matrícula desativada:
- orientar contato com a escola para regularizar ou reativar o cadastro

### Dados que o atendente deve pedir para resolver mais rápido
- Nome completo do aluno
- Nome da turma ou do evento, quando a dúvida envolver aula ou evento
- Mês da cobrança ou descrição do ingresso, quando a dúvida envolver pagamento
- Se o pagamento já foi feito e por qual método
- Print da tela ou mensagem de erro, quando houver falha no app

### Como orientar o usuário por tema
- Acesso/login:
- explique o caminho correto de entrada e confirme se a pessoa está no perfil certo
- se a pessoa pedir ajuda para entrar ou acessar o app, envie o link oficial do app/site para ela abrir diretamente
- Matrícula em nova turma:
- se a matrícula não puder ser concluída na hora com base nas informações disponíveis, oriente o interessado a aguardar que em breve a equipe vai passar os dados e os requisitos para matrícula na nova turma
- Telefone/WhatsApp:
- oriente verificação por código via WhatsApp
- Aulas:
- oriente pela área Aulas e, se necessário, pelo contato de WhatsApp da escola
- Pagamentos:
- oriente pela área Pagamentos, usando PIX, conferência de status e suporte financeiro quando necessário
- Eventos:
- explique a ordem correta: participar, pagar se houver cobrança, depois gerar voucher
- Conta:
- oriente atualização de dados diretamente na área Conta

### Limites do atendimento
- Não invente regras, preços ou prazos que não estejam no sistema ou nas configurações atuais.
- Se faltar informação sobre turma, pagamento, evento ou cadastro, a resposta correta é dizer que vai confirmar certinho com a equipe e retornar com a orientação certa.
- Quando a conversa for por áudio e a solução exigir link, caminho no app ou instrução melhor de ler, complemente com mensagem escrita.
`;
