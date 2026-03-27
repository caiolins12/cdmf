/**
 * Chatbot de triagem - CDMF
 * Usa OpenAI gpt-4.1-nano para atender o usuário com fluxo condicional e contextual.
 */

import { getDocument, listDocuments, setDocument, updateDocument } from "./doc-store";
import { makeId } from "./http";
import { APP_SUPPORT_KNOWLEDGE } from "./supportKnowledge";
import { createPixPaymentForBot, createEventVoucherForBot, checkAndNotifyPaidInvoices } from "./payments";

// ============================================================
// Config
// ============================================================

const OPENAI_MODEL = "gpt-4.1-nano";
const MAX_BOT_TURNS = 10;
const BOT_DONE_MARKER = "[FIM_ATENDIMENTO]";
const BOT_ESCALATE_MARKER = "[AGUARDAR_GESTOR]";
const BOT_PIX_MARKER = "[GERAR_PIX:";  // formato: [GERAR_PIX:invoiceId]
const BOT_VOUCHER_MARKER = "[GERAR_VOUCHER:";  // formato: [GERAR_VOUCHER:eventId]
const BOT_NAME = "Juliana";
const REPETITION_THRESHOLD = 2; // quantas vezes o usuário pode perguntar a mesma coisa antes de escalar
const SCHOOL_TIMEZONE = "America/Sao_Paulo";
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL?.trim() || "https://cdmf.vercel.app";
const TEXT_COMPANION_START = "[TEXTO_COMPLEMENTAR]";
const TEXT_COMPANION_END = "[/TEXTO_COMPLEMENTAR]";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";

type ResponseMode = "text" | "audio";

const AUDIO_RESPONSE_PROMPT = `## Modo de resposta por áudio

Você está respondendo a uma mensagem de voz e sua resposta será convertida em áudio.

- Escreva como se estivesse gravando um áudio curto de WhatsApp, com tom humano, acolhedor e natural.
- Use português do Brasil falado de forma popular e clara, com o jeitinho natural do brasileiro se comunicar, mas sem gírias.
- Prefira frases curtas, simples e fáceis de entender ao ouvir.
- Evite listas longas, excesso de detalhes de uma vez e linguagem muito formal.
- Evite emojis, markdown, asteriscos, bullets e qualquer formatação visual desnecessária.
- Nunca leia datas, horários, valores ou endereços do jeito exato que estão escritos no sistema; transforme isso em fala natural.
- Ao mencionar evento, data e horário, prefira construções comunicativas como "na próxima sexta", "às oito da noite", "lá no nosso Centro de Danças" ou "no salão principal", quando isso fizer sentido.
- Se houver mais de uma informação importante, apresente em ordem natural de fala.
- Quando precisar orientar o usuário, fale como uma pessoa real explicando com calma.
- Em áudio, priorize clareza acima de completude.
- Se a solução ficar melhor com link clicável, passo a passo, código, área do app ou orientação escrita, envie isso em um bloco separado usando exatamente:
${TEXT_COMPANION_START}
texto escrito complementar
${TEXT_COMPANION_END}
- Nesse bloco complementar, só inclua o link oficial do app quando o usuário precisar de orientação para entrar, acessar ou abrir o app/site.
- O bloco complementar é escrito e separado do áudio; não leia esse bloco como se fosse parte da fala.
- Sempre que usar um bloco complementar, faça o áudio combinar com isso, com frases naturais como "vou te mandar o link por aqui" ou "também vou te deixar isso por escrito aqui na conversa".
- Busque respostas entre 1 e 4 frases curtas, salvo se o contexto exigir um pouco mais.`;

// ============================================================
// Data helpers — turmas, eventos e configurações da escola
// ============================================================

const DAYS_OF_WEEK = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/**
 * Normaliza telefone para formato comparável: apenas dígitos, com 55 + DDD + 9 dígitos.
 * Lida com variações: +55, 0xx, com/sem nono dígito, parênteses, traços, espaços.
 * Ex: "(81) 9988-7766" → "5581999887766"
 *     "81999887766"    → "5581999887766"
 *     "5581999887766"  → "5581999887766"
 *     "9988-7766"      → "999887766" (sem DDD, retorna só os dígitos)
 */
function normalizePhoneForMatch(phone: string): string {
  let digits = phone.replace(/\D/g, "");

  // Remover prefixo 0 de discagem interurbana (0xx)
  if (digits.startsWith("0") && !digits.startsWith("00")) {
    digits = digits.slice(1);
  }

  // Remover código país 55 para normalizar
  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  // Agora digits deve ser DDD(2) + número(8 ou 9) = 10 ou 11 dígitos
  // Se tem 10 dígitos (DDD + 8), adiciona o nono dígito (9) após o DDD
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const number = digits.slice(2);
    digits = `${ddd}9${number}`;
  }

  // Adicionar código país
  if (digits.length === 11) {
    digits = `55${digits}`;
  }

  return digits;
}

function formatCurrencyFromCents(value?: number): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function getLocalDateParts(date = new Date()): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

function getTodayISOInSchoolTimezone(): string {
  const { year, month, day } = getLocalDateParts();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseISODateToLocalDate(isoDate: string): Date | null {
  const [yearStr, monthStr, dayStr] = isoDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatFullDatePtBr(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SCHOOL_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatIsoDateToPtBr(dateValue?: string): string | null {
  if (!dateValue || typeof dateValue !== "string") return null;
  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) return null;
  return `${day}/${month}/${year}`;
}

function formatTimestampToPtBr(value?: number): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SCHOOL_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function mapEnrollmentStatus(value: string | undefined): string {
  if (value === "ativo") return "ativa";
  if (value === "inativo") return "inativa";
  return "não informada";
}

function mapPaymentStatus(value: string | undefined): string {
  if (value === "em_dia") return "em dia";
  if (value === "pendente") return "pendente";
  if (value === "atrasado") return "atrasado";
  if (value === "sem_cobranca") return "sem cobrança";
  return "não informado";
}

function mapInvoiceStatus(value: string | undefined): string {
  if (value === "pending") return "pendente";
  if (value === "overdue") return "vencida";
  if (value === "paid") return "paga";
  if (value === "cancelled") return "cancelada";
  return value || "desconhecido";
}

function extractTicketLabel(description: string | undefined): string {
  const raw = (description || "Ingresso de evento").trim();
  return raw.replace(/^Ingresso:\s*/i, "").trim() || "evento";
}

function getRelativeDateLabel(eventDate: Date, todayDate: Date): string {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((eventDate.getTime() - todayDate.getTime()) / msPerDay);
  const weekday = DAYS_OF_WEEK[eventDate.getDay()].toLowerCase();
  const weekdayArticle = weekday === "sábado" || weekday === "domingo" ? "neste" : "nesta";
  const nextWeekdayArticle = weekday === "sábado" || weekday === "domingo" ? "no próximo" : "na próxima";

  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "amanhã";
  if (diffDays > 1 && diffDays < 7) return `${weekdayArticle} ${weekday}`;
  if (diffDays >= 7 && diffDays < 14) return `${nextWeekdayArticle} ${weekday}`;
  return `no dia ${new Intl.DateTimeFormat("pt-BR", { timeZone: SCHOOL_TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(eventDate)}`;
}

function formatHourForSpeech(time?: string): string | null {
  if (!time) return null;
  const [rawHour, rawMinute] = time.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const period =
    hour >= 0 && hour < 6 ? "da madrugada" :
    hour < 12 ? "da manhã" :
    hour < 18 ? "da tarde" :
    "da noite";

  const normalizedHour = hour % 12 || 12;
  const hourText = normalizedHour === 1 ? "uma" : String(normalizedHour);

  if (minute === 0) return `às ${hourText} ${period}`;
  if (minute === 30) return `às ${hourText} e meia ${period}`;
  return `às ${normalizedHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function formatLocationForSpeech(location?: string): string | null {
  if (!location) return null;
  const normalized = location.trim();
  if (!normalized) return null;

  if (/^no\s|^na\s|^em\s/i.test(normalized)) {
    return normalized;
  }

  if (/centro de danças|cdmf/i.test(normalized)) {
    return `lá no ${normalized}`;
  }

  return `lá na ${normalized}`;
}

function buildAudioEventHint(event: any, eventDate: Date | null, todayDate: Date | null): string | null {
  if (!eventDate || !todayDate) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((eventDate.getTime() - todayDate.getTime()) / msPerDay);
  const weekday = DAYS_OF_WEEK[eventDate.getDay()].toLowerCase();
  const dayOfMonth = String(eventDate.getDate()).padStart(2, "0");
  const isWeekend = weekday === "sábado" || weekday === "domingo";

  let whenText: string;
  if (diffDays === 0) {
    whenText = `hoje, ${weekday}, dia ${dayOfMonth}`;
  } else if (diffDays === 1) {
    whenText = `amanhã, ${weekday}, dia ${dayOfMonth}`;
  } else if (isWeekend && diffDays > 1 && diffDays < 7) {
    whenText = `no próximo final de semana, no ${weekday}, dia ${dayOfMonth}`;
  } else if (diffDays > 1 && diffDays < 7) {
    whenText = `nesta ${weekday}, dia ${dayOfMonth}`;
  } else if (isWeekend && diffDays >= 7 && diffDays < 14) {
    whenText = `no outro final de semana, no ${weekday}, dia ${dayOfMonth}`;
  } else if (diffDays >= 7 && diffDays < 14) {
    whenText = `na próxima ${weekday}, dia ${dayOfMonth}`;
  } else {
    whenText = `no dia ${dayOfMonth}`;
  }

  const eventKind = event?.type === "baile" ? "o nosso baile" : `o evento ${event?.name}`;
  const timeText = formatHourForSpeech(event?.time);
  const locationText = formatLocationForSpeech(event?.location);
  const pieces = [`${eventKind} vai ser ${whenText}`];
  if (timeText) pieces.push(timeText);
  if (locationText) pieces.push(locationText);

  return `${pieces.join(", ")}.`;
}

function getEventTemporalContext(eventDate: Date | null, todayDate: Date | null): string | null {
  if (!eventDate || !todayDate) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((eventDate.getTime() - todayDate.getTime()) / msPerDay);

  if (diffDays === 0) return "acontece hoje";
  if (diffDays === 1) return "acontece amanhã";
  if (diffDays > 1 && diffDays < 7) return `acontece nesta semana e faltam ${diffDays} dias`;
  if (diffDays >= 7 && diffDays < 14) return `acontece na próxima semana e faltam ${diffDays} dias`;
  if (diffDays > 14) return `ainda faltam ${diffDays} dias`;
  return `faltam ${diffDays} dias`;
}

async function findStudentProfileByPhone(phone: string): Promise<{ id: string; data: any } | null> {
  const normalizedPhone = normalizePhoneForMatch(phone);
  if (!normalizedPhone || normalizedPhone.length < 8) return null;

  const students = await listDocuments("profiles", [
    { type: "where", field: "role", op: "==", value: "student" },
    { type: "limit", value: 5000 },
  ]);

  // Tentativa 1: match exato pelo telefone completo normalizado
  let match = students.find((student) => {
    const candidate = typeof student.data.phone === "string" ? normalizePhoneForMatch(student.data.phone) : "";
    return candidate === normalizedPhone;
  });

  // Tentativa 2: match pelos últimos 10 dígitos (DDD + número com 9o dígito)
  if (!match) {
    const last10 = normalizedPhone.slice(-10);
    if (last10.length === 10) {
      match = students.find((student) => {
        const candidate = typeof student.data.phone === "string" ? normalizePhoneForMatch(student.data.phone) : "";
        return candidate.slice(-10) === last10;
      });
    }
  }

  // Tentativa 3: match pelos últimos 9 dígitos (número sem DDD ou com variação)
  if (!match) {
    const last9 = normalizedPhone.slice(-9);
    if (last9.length === 9) {
      match = students.find((student) => {
        const candidate = typeof student.data.phone === "string" ? normalizePhoneForMatch(student.data.phone) : "";
        return candidate.slice(-9) === last9;
      });
    }
  }

  return match ? { id: match.id, data: match.data } : null;
}

async function buildStudentFinancialContext(studentId?: string, studentPhone?: string): Promise<string[]> {
  const lines: string[] = [];

  let resolvedStudentId = studentId || "";
  let profileData: any = null;

  if (resolvedStudentId) {
    profileData = await getDocument("profiles", resolvedStudentId);
  }

  if (!profileData && studentPhone) {
    const studentMatch = await findStudentProfileByPhone(studentPhone);
    if (studentMatch) {
      resolvedStudentId = studentMatch.id;
      profileData = studentMatch.data;
    }
  }

  if (!resolvedStudentId || !profileData) {
    lines.push("## Situação atual do aluno desta conversa");
    lines.push("- Não foi possível identificar o cadastro do aluno pelo número de WhatsApp desta conversa.");
    lines.push("- Se a dúvida depender de cobrança, ingresso, pagamento ou voucher, informe que o número do WhatsApp precisa ser o mesmo cadastrado no app do CDMF para que o atendimento seja feito automaticamente.");
    lines.push("- NÃO peça dados pessoais (CPF, e-mail, etc.) — a identificação é sempre pelo número do telefone.");
    return lines;
  }

  const [invoicesRaw, vouchersRaw] = await Promise.all([
    listDocuments("invoices", [
      { type: "where", field: "studentId", op: "==", value: resolvedStudentId },
      { type: "limit", value: 200 },
    ]),
    listDocuments("vouchers", [
      { type: "where", field: "studentId", op: "==", value: resolvedStudentId },
      { type: "limit", value: 200 },
    ]),
  ]);

  const invoices = invoicesRaw
    .map((doc) => ({ ...(doc.data as any), _docId: doc.id }))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const vouchers = vouchersRaw
    .map((doc) => doc.data as any)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

  const voucherByInvoiceId = new Map<string, any>();
  for (const voucher of vouchers) {
    if (voucher?.invoiceId && !voucherByInvoiceId.has(voucher.invoiceId)) {
      voucherByInvoiceId.set(voucher.invoiceId, voucher);
    }
  }

  const pendingInvoices = invoices.filter((invoice) => invoice.status === "pending" || invoice.status === "overdue");
  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
  const ticketInvoices = invoices.filter(
    (invoice) => Boolean(invoice.isGuestTicket) || /^Ingresso:/i.test(String(invoice.description || ""))
  );

  lines.push("## Situação atual do aluno desta conversa");
  lines.push(`- Aluno identificado: ${String(profileData.name || "Aluno")} (ID ${resolvedStudentId}).`);
  lines.push(`- Matrícula atual: ${mapEnrollmentStatus(profileData.enrollmentStatus)}.`);
  lines.push(`- Status financeiro cadastral: ${mapPaymentStatus(profileData.paymentStatus)}.`);

  // Turmas do aluno — buscar nomes reais das turmas vinculadas
  const studentClassIds = Array.isArray(profileData.classes) ? profileData.classes : [];
  if (studentClassIds.length > 0) {
    const classNames: string[] = [];
    for (const classId of studentClassIds.slice(0, 10)) {
      try {
        const classDoc = await getDocument("classes", classId);
        if (classDoc) {
          const className = String((classDoc as any).name || classId);
          const schedule = (classDoc as any).schedule;
          const scheduleStr = Array.isArray(schedule) && schedule.length
            ? schedule.map((s: any) => `${DAYS_OF_WEEK[s.dayOfWeek] ?? s.dayOfWeek} ${s.startTime}–${s.endTime}`).join(", ")
            : "";
          classNames.push(scheduleStr ? `${className} (${scheduleStr})` : className);
        }
      } catch { /* ignora erros individuais */ }
    }
    lines.push(`- Turmas matriculado: ${classNames.length > 0 ? classNames.join("; ") : "nenhuma turma identificada"}.`);
  } else {
    lines.push("- Turmas matriculado: nenhuma turma vinculada no perfil.");
  }

  if (pendingInvoices.length > 0) {
    lines.push("- Cobranças em aberto (o aluno pode pagar via PIX pelo bot):");
    for (const invoice of pendingInvoices.slice(0, 5)) {
      const dueDate = formatIsoDateToPtBr(invoice.dueDate) || "--/--/----";
      const amount = formatCurrencyFromCents(invoice.amount) || "valor não informado";
      const invoiceId = String(invoice._docId || invoice.id || "");
      lines.push(`  - [ID: ${invoiceId}] ${String(invoice.description || "Cobrança")} | ${mapInvoiceStatus(invoice.status)} | ${amount} | vencimento ${dueDate}`);
    }
  } else {
    lines.push("- Cobranças em aberto: nenhuma identificada.");
  }

  if (paidInvoices.length > 0) {
    lines.push("- Pagamentos confirmados recentes:");
    for (const invoice of paidInvoices.slice(0, 5)) {
      const paidAt = formatTimestampToPtBr(invoice.paidAt) || "data não registrada";
      const amount = formatCurrencyFromCents(invoice.amount) || "valor não informado";
      lines.push(`  - ${String(invoice.description || "Cobrança")} | paga | ${amount} | confirmada em ${paidAt}`);
    }
  } else {
    lines.push("- Pagamentos confirmados recentes: nenhum identificado.");
  }

  if (ticketInvoices.length > 0) {
    lines.push("- Situação dos ingressos de evento:");
    for (const invoice of ticketInvoices.slice(0, 6)) {
      const ticketLabel = extractTicketLabel(invoice.description);
      const linkedVoucher = voucherByInvoiceId.get(String(invoice.id || ""));
      let ticketStatus = mapInvoiceStatus(invoice.status);

      if (invoice.status === "paid" && linkedVoucher?.status === "valid") {
        ticketStatus = `pago e com voucher disponível (código: ${linkedVoucher.voucherCode})`;
      } else if (invoice.status === "paid" && linkedVoucher?.status === "used") {
        ticketStatus = "pago e voucher já utilizado";
      } else if (invoice.status === "paid" && linkedVoucher?.status === "cancelled") {
        ticketStatus = "pago, mas voucher cancelado";
      } else if (invoice.status === "paid") {
        ticketStatus = "pago; voucher ainda não aparece vinculado";
      }

      const amount = formatCurrencyFromCents(invoice.amount) || "valor não informado";
      const dueDate = formatIsoDateToPtBr(invoice.dueDate);
      const guestLabel = invoice.isGuestTicket ? " | ingresso de acompanhante" : "";
      const dateLabel = dueDate ? ` | data ${dueDate}` : "";
      lines.push(`  - ${ticketLabel} | ${ticketStatus} | ${amount}${dateLabel}${guestLabel}`);
    }
  } else {
    lines.push("- Situação dos ingressos de evento: nenhum ingresso identificado.");
  }

  const standaloneVouchers = vouchers.filter((voucher) => !voucher.invoiceId);
  if (standaloneVouchers.length > 0) {
    lines.push("- Vouchers encontrados sem cobrança vinculada:");
    for (const voucher of standaloneVouchers.slice(0, 5)) {
      lines.push(`  - ${String(voucher.eventName || "Evento")} | voucher ${String(voucher.status || "desconhecido")}`);
    }
  }

  lines.push("- Sempre use esta seção para responder dúvidas sobre cobrança, ingresso, pagamento e voucher antes de orientar o usuário.");
  return lines;
}

async function getSchoolContext(responseMode: ResponseMode, studentId?: string, studentPhone?: string): Promise<string> {
  const lines: string[] = [];
  const todayISO = getTodayISOInSchoolTimezone();
  const todayDate = parseISODateToLocalDate(todayISO);
  const isAudioMode = responseMode === "audio";

  if (todayDate) {
    lines.push("## Referência de data");
    lines.push(`- Hoje é ${formatFullDatePtBr(todayDate)} no fuso de São Paulo.`);
    lines.push("- Use essa data como referência principal para interpretar quando um evento acontece.");
    lines.push("");
  }

  lines.push("## Link oficial do app");
  lines.push(`- Link oficial do app/site do CDMF: ${APP_PUBLIC_URL}`);
  lines.push("- Esse link deve ser enviado principalmente quando o usuário pedir orientação para entrar, acessar ou abrir o app/site.");
  lines.push("");

  // Configurações personalizáveis (matrícula, pagamento, mensalidades)
  try {
    const config = await getDocument("chatbot_config", "school_info");
    if (config) {
      const c = config as any;
      if (c.enrollmentInfo) {
        lines.push("## Como se matricular");
        lines.push(c.enrollmentInfo);
        lines.push("");
      }
      if (c.paymentInfo) {
        lines.push("## Formas de pagamento");
        lines.push(c.paymentInfo);
        lines.push("");
      }
      if (c.tuitionInfo) {
        lines.push("## Valores de mensalidade");
        lines.push(c.tuitionInfo);
        lines.push("");
      }
    }
  } catch {
    // Sem config — o bot vai encaminhar para humano nesses tópicos
  }

  // Turmas ativas
  try {
    const classesRaw = await listDocuments("classes", [
      { type: "where", field: "active", op: "==", value: true },
      { type: "orderBy", field: "name", direction: "asc" },
    ]);

    if (classesRaw.length > 0) {
      lines.push("## Turmas disponíveis");
      for (const doc of classesRaw) {
        const c = doc.data as any;
        const scheduleStr = c.schedule?.length
          ? c.schedule
              .map((s: any) => `${DAYS_OF_WEEK[s.dayOfWeek] ?? s.dayOfWeek} ${s.startTime}–${s.endTime}`)
              .join(", ")
          : "Horário a definir";
        const teacher = c.teacherName ? ` | Prof. ${c.teacherName}` : "";
        lines.push(`- ${c.name}${teacher} | ${scheduleStr}`);
      }
    } else {
      lines.push("## Turmas disponíveis\n- Nenhuma turma ativa no momento.");
    }
  } catch {
    lines.push("## Turmas disponíveis\n- Não foi possível consultar as turmas.");
  }

  lines.push("");

  // Eventos ativos (data >= hoje)
  try {
    const eventsRaw = await listDocuments("events", [
      { type: "where", field: "active", op: "==", value: true },
      { type: "orderBy", field: "date", direction: "asc" },
    ]);

    const upcoming = eventsRaw.filter((doc) => {
      const d = doc.data as any;
      return d.date >= todayISO;
    });

    if (upcoming.length > 0) {
      lines.push("## Eventos próximos");
      for (const doc of upcoming) {
        const e = doc.data as any;
        const [year, month, day] = (e.date as string).split("-");
        const dateStr = `${day}/${month}/${year}`;
        const eventDate = parseISODateToLocalDate(e.date);
        const weekday = eventDate ? DAYS_OF_WEEK[eventDate.getDay()] : null;
        const relativeDate = eventDate && todayDate ? getRelativeDateLabel(eventDate, todayDate) : null;
        const temporalContext = getEventTemporalContext(eventDate, todayDate);
        const audioHint = buildAudioEventHint(e, eventDate, todayDate);
        const dateReference = isAudioMode
          ? relativeDate
            ? ` | Quando: ${relativeDate}`
            : ` | Data: ${dateStr}`
          : weekday && relativeDate
            ? ` | Referência: ${relativeDate} (${weekday}, ${dateStr})`
            : ` | Data: ${dateStr}`;
        const temporalReference = temporalContext ? ` | Status temporal: ${temporalContext}` : "";
        const time = e.time ? ` | Horário: ${e.time}` : "";
        const location = e.location ? ` | 📍 ${e.location}` : "";
        const ticketPrice = formatCurrencyFromCents(e.price);
        const ticketInfo = e.requiresPayment
          ? ` | Ingresso: ${ticketPrice ?? "valor a confirmar"}`
          : ticketPrice
            ? ` | Valor: ${ticketPrice}`
            : " | Entrada gratuita";
        const desc = e.description ? ` — ${e.description}` : "";
        const speechHint = isAudioMode && audioHint ? ` | Fala natural no áudio: "${audioHint}"` : "";
        lines.push(`- [ID: ${doc.id}] ${e.name}${dateReference}${temporalReference}${time}${location}${ticketInfo}${desc}${speechHint}`);
      }
    } else {
      lines.push("## Eventos próximos\n- Nenhum evento agendado no momento.");
    }
  } catch {
    lines.push("## Eventos próximos\n- Não foi possível consultar os eventos.");
  }

  lines.push("");
  try {
    const studentFinancialLines = await buildStudentFinancialContext(studentId, studentPhone);
    lines.push(...studentFinancialLines);
  } catch {
    lines.push("## Situação atual do aluno desta conversa");
    lines.push("- Não foi possível consultar as cobranças, ingressos e vouchers do aluno neste momento.");
  }

  lines.push("");
  lines.push(APP_SUPPORT_KNOWLEDGE);

  return lines.join("\n");
}

function buildSystemPrompt(
  schoolContext: string,
  isFirstMessage: boolean,
  studentFirstName: string,
  responseMode: ResponseMode
): string {
  const todayReferenceDate = parseISODateToLocalDate(getTodayISOInSchoolTimezone());
  const todayReferenceText = todayReferenceDate
    ? formatFullDatePtBr(todayReferenceDate)
    : "data atual indisponível";

  const greetingInstruction = isFirstMessage
    ? `Como é a primeira mensagem do usuário, cumprimente de forma calorosa, apresente-se e chame o usuário pelo primeiro nome (${studentFirstName}) se disponível.`
    : `NÃO repita saudações. A conversa já está em andamento — responda diretamente ao que o usuário enviou.`;

  const nameInstruction = studentFirstName
    ? `O nome do usuário é "${studentFirstName}". Use o primeiro nome dele naturalmente ao longo da conversa (não em toda mensagem, apenas quando soar natural).`
    : `O nome do usuário é desconhecido. Trate-o de forma gentil sem usar nome.`;

  const roleInstruction = `Você atende o próprio número oficial do Centro de Danças Marcelo Ferreira no WhatsApp. Aja como uma atendente virtual da escola, acolhendo alunos e interessados como quem está falando diretamente pelo canal oficial da equipe. Seja direta e resolva tudo na mesma mensagem — você já tem todas as informações disponíveis.`;

  const missingInfoInstruction =
    responseMode === "audio"
      ? `- Se a informação não estiver disponível no contexto, diga de forma gentil que essa informação não está disponível no momento e sugira entrar em contato com a secretaria para mais detalhes.
- Seja direta e resolva na mesma resposta. NUNCA diga "aguarde", "vou verificar", "um momento" ou qualquer frase que prometa retorno futuro.
- Se a pessoa pedir matrícula em nova turma, oriente com as informações de turmas disponíveis no contexto.`
      : `- Se a informação não estiver disponível no contexto, diga de forma gentil que essa informação não está disponível no momento e sugira entrar em contato com a secretaria.
- Seja direta e resolva na mesma resposta. NUNCA diga "aguarde", "vou verificar", "um momento" ou qualquer frase que prometa retorno futuro.
- Se a pessoa pedir matrícula em nova turma, oriente com as informações de turmas disponíveis no contexto.`;

  const formattingInstruction =
    responseMode === "audio"
      ? `- Como a resposta será falada em áudio, escreva em linguagem conversada, com frases curtas, simples e naturais de ouvir.
- Não use emojis, markdown, listas longas nem formatação visual para organizar a resposta.
- Entregue uma orientação por vez e priorize clareza, acolhimento e ritmo de fala humano.
- Quando mencionar data, hora, local ou preço, reescreva essas informações como alguém realmente falaria no WhatsApp, em vez de ler o formato escrito do sistema.
- Evite dizer datas e horários de forma engessada ou literal demais; prefira algo mais natural e comunicativo sempre que possível.
- Quando existir no contexto uma frase de "Fala natural no áudio", use esse estilo como referência principal para responder.
- Se você já falou "dia 28", por exemplo, não repita "dia 28" de novo na mesma resposta.
- Ao falar de baile, workshop ou evento próximo, você pode soar um pouco mais animada e convidativa, sem exagero.
- Quando precisar complementar o áudio com texto escrito, use o bloco ${TEXT_COMPANION_START} ... ${TEXT_COMPANION_END}.
- Use esse texto complementar quando houver link clicável, passo a passo, código PIX, caminho no app ou qualquer informação que o usuário precise ler ou tocar.
- Soe como uma atendente brasileira educada e próxima, sem gírias e sem parecer texto escrito demais.`
      : `- Divida a resposta em parágrafos curtos (2-3 frases cada), separados por uma linha em branco entre eles. Nunca escreva um bloco grande de texto corrido.
- Use emojis relevantes e variados (não repita o mesmo emoji). Coloque emojis no início de parágrafos ou ao lado de informações-chave, não em excesso.
- Use listas quando houver múltiplos itens, mas mantenha cada item breve.
- Cada ideia ou informação deve ficar em seu próprio parágrafo separado.`;

  const closingInstruction =
    responseMode === "audio"
      ? `- Varie as mensagens de encerramento com naturalidade, sem soar robótica e sem repetir bordões na mesma conversa.`
      : `- Varie as mensagens de encerramento — nunca use a mesma frase ou emoji de fechamento duas vezes na mesma conversa.`;

  const toneInstruction =
    responseMode === "audio"
      ? `- Responda no mesmo idioma e tom do usuário (formal/informal), mas adapte a redação para soar leve, clara e humana quando ouvida.`
      : `- Responda no mesmo idioma e tom do usuário (formal/informal).`;

  const dateAccuracyInstruction =
    responseMode === "audio"
      ? `- Ao falar sobre eventos, use a referência de data atual informada no contexto. Não mude o ano nem trate um evento desta semana como se fosse do ano que vem.
- Se houver uma referência como "neste sábado" ou "na próxima sexta" no contexto, siga essa referência ao responder em áudio.
- Se o contexto disser que um evento acontece nesta semana, não diga que nesta semana não haverá evento.`
      : `- Ao falar sobre eventos, use a referência de data atual informada no contexto. Não mude o ano nem trate um evento próximo como se fosse do ano que vem.
- Se houver uma referência relativa do evento no contexto, siga essa referência e preserve a data exata cadastrada.
- Se o contexto disser que um evento acontece nesta semana, não diga que nesta semana não haverá evento.`;

  const closingExamples =
    responseMode === "audio"
      ? `- "Perfeito. Se precisar de mais alguma coisa, é só me chamar por aqui."
- "Pronto, ficou certinho. Se você quiser, eu também posso te ajudar com mais alguma coisa."
- "Pode deixar. Qualquer dúvida, me chama aqui que eu sigo com você."
- "Vai ser na próxima sexta, às oito da noite, lá no nosso Centro de Danças. Se quiser, eu também te passo mais detalhes por aqui."`
      : `- "Perfeito! ✅ Se precisar de mais alguma coisa, pode chamar. Até logo, ${studentFirstName || "pessoal"}!"
- "Ótimo! 🙌 Qualquer dúvida é só falar. Tenha um ótimo dia!"
- "Certo! 👍 Estou por aqui se precisar. Até mais!"
- "Entendido! 💪 Foi um prazer ajudar. Até a próxima!"`;

  return `Você é ${BOT_NAME}, assistente virtual da CDMF (Centro de Danças Marcelo Ferreira), uma escola de dança.

IMPORTANTE: hoje é ${todayReferenceText}, no fuso de São Paulo. Use essa data como referência obrigatória ao falar de eventos, dias da semana e prazos.

${greetingInstruction}

${nameInstruction}

${roleInstruction}

Você tem acesso às informações atualizadas da escola:

${schoolContext}

---

## Escopo do atendimento

Você SOMENTE atende assuntos relacionados ao CDMF:
- Informações sobre turmas, horários e professores
- Informações sobre eventos
- Matrícula, mensalidades e pagamentos (exclusivamente via PIX)
- Orientação sobre uso do app do aluno, login, conta, ingressos, vouchers e fluxo de eventos
- Dúvidas gerais sobre a escola

**Se o usuário perguntar qualquer coisa fora desse escopo** (receitas, política, entretenimento, outros negócios, etc.), responda educadamente que você só pode ajudar com assuntos do CDMF e pergunte se pode ajudar com algo relacionado à escola.

## Identificação do aluno

- O aluno é identificado **automaticamente pelo número do WhatsApp** — o sistema já cruzou o telefone desta conversa com o cadastro no app do CDMF.
- Todas as informações do aluno (cobranças, turmas, vouchers, pagamentos) já estão disponíveis na seção "Situação atual do aluno desta conversa".
- **NUNCA peça CPF, e-mail, nome completo ou qualquer dado pessoal** para identificar o aluno ou processar pagamentos/ingressos. Tudo é feito automaticamente pelo número.
- Se o sistema não conseguiu identificar o aluno (seção diz "Não foi possível identificar"), informe que o número do WhatsApp precisa ser o mesmo cadastrado no app do CDMF.

## Como agir

- Se a dúvida for sobre **turmas ou eventos**: responda com as informações acima.
- Se a dúvida for sobre **uso do app, login, conta, ingressos, vouchers, cobranças e fluxo operacional**: use a base de atendimento do app e oriente o usuário passo a passo com clareza.
- Se a dúvida for sobre **cobrança, ingresso, pagamento ou voucher**, consulte primeiro a seção "Situação atual do aluno desta conversa" e responda com base nesses dados reais.
- **O CDMF aceita pagamentos EXCLUSIVAMENTE via PIX.** Não há outra forma de pagamento aceita — não é possível pagar com cartão, dinheiro, boleto ou qualquer outro método. Se o aluno perguntar sobre outra forma, informe isso claramente.
- Quando o aluno perguntar sobre **pagamento, mensalidade ou cobrança** e houver cobranças pendentes no contexto dele, **informe proativamente** que ele pode pagar direto por aqui na conversa do WhatsApp via PIX.
- **ANTES de gerar PIX**, verifique o status da cobrança na seção "Situação atual do aluno":
  - Se o status for "pendente" ou "vencida/atrasada": pode gerar o PIX normalmente.
  - Se o status for "paga": NÃO gere PIX. Informe que essa cobrança já está paga e pergunte se precisa de algo mais.
  - Se o status for "cancelada": NÃO gere PIX. Informe que a cobrança foi cancelada.
- Quando o aluno **pedir para pagar ou confirmar que quer pagar**, inclua o marcador ${BOT_PIX_MARKER}invoiceId] **na mesma resposta, imediatamente**. NÃO diga "vou gerar" ou "aguarde" sem incluir o marcador — o marcador DEVE estar presente na resposta que confirma o pagamento. O sistema gera o PIX e envia o código automaticamente ao aluno logo em seguida.
- Se houver apenas **uma cobrança pendente** e o aluno pedir para pagar, gere o PIX diretamente incluindo o marcador ${BOT_PIX_MARKER}invoiceId] na resposta.
- Se houver **mais de uma cobrança pendente**, liste as cobranças (descrição e valor) e pergunte qual quer pagar. Quando ele escolher, inclua o marcador na resposta imediatamente.
- Se **não houver cobranças pendentes** e o aluno pedir para pagar, informe que não há cobranças em aberto.
- NUNCA gere PIX para cobranças que não estejam listadas no contexto do aluno. Só use IDs reais que aparecem na seção "Cobranças em aberto".
- Ao informar sobre cobranças pendentes, sempre mencione a opção de pagar pelo WhatsApp via PIX.
- Se o aluno perguntar sobre **eventos** e houver eventos próximos com ingresso pago, informe que ele pode comprar o ingresso direto pelo WhatsApp.
- Quando o aluno **confirmar que quer comprar ingresso**, inclua o marcador ${BOT_VOUCHER_MARKER}eventId] **na mesma resposta, imediatamente**. O sistema gera a cobrança, o PIX e o voucher automaticamente.
- **ANTES de gerar voucher/ingresso**, verifique a seção "Situação dos ingressos de evento":
  - Se já tem voucher válido: informe o código e NÃO gere outro. Sugira levar acompanhantes.
  - Se o ingresso está pago mas sem voucher vinculado: informe que o pagamento já foi feito e que o voucher será gerado em breve.
  - Se o voucher já foi utilizado: informe que já foi usado.
- Quando o aluno tiver voucher, **sugira proativamente** se ele quer levar acompanhantes.
- Para **acompanhante**, pergunte o nome primeiro. Quando o aluno informar o nome, inclua o marcador ${BOT_VOUCHER_MARKER}eventId:ACOMPANHANTE:nomeDoAcompanhante] na mesma resposta.
- NUNCA gere voucher para eventos que não estejam listados na seção "Eventos próximos". Só use IDs reais.
- **REGRA CRÍTICA**: NUNCA prometa gerar PIX ou voucher sem incluir o respectivo marcador na mesma resposta. Se você disser "vou gerar", o marcador DEVE estar na mesma mensagem. Sem o marcador, nada é gerado.
- **NUNCA diga "aguarde", "vou verificar", "vou consultar", "um momento" ou qualquer variação**. Você já tem TODAS as informações do aluno no contexto acima. Não existe nada para "verificar" — os dados de cobranças, turmas, eventos, vouchers e pagamentos já estão carregados. Responda diretamente com a informação ou ação.
- Se a informação que o aluno pediu está no contexto: responda imediatamente.
- Se a informação NÃO está no contexto: diga que não tem essa informação disponível e sugira entrar em contato com a secretaria. NÃO diga que vai verificar.
- Se a dúvida for sobre **matrícula, pagamento ou mensalidade**: use as informações acima se disponíveis; caso não existam, diga que essa informação não está disponível agora e sugira entrar em contato com a secretaria.
- Se a pessoa demonstrar interesse em **matrícula em nova turma**, oriente com base nas informações de turmas disponíveis no contexto.
- Só envie o link oficial do app na mensagem escrita complementar quando o usuário pedir ajuda para entrar, acessar ou abrir o app/site.
- Se a dúvida for sobre outro assunto do CDMF que você não tem informação: diga que essa informação não está disponível e sugira entrar em contato com a secretaria.
- Se você já respondeu a necessidade do usuário: pergunte se pode ajudar com mais alguma coisa.
- Se o usuário confirmar que não precisa de mais nada (ex: "não", "obrigado", "tudo bem"): finalize com gentileza e inclua ${BOT_DONE_MARKER}.
- Se perceber que o usuário está repetindo a mesma solicitação sem conseguir resolver, inclua ${BOT_ESCALATE_MARKER} no fim da resposta para escalar ao gestor.
${missingInfoInstruction}

## Regras obrigatórias

- SEMPRE inicie cada resposta com exatamente "${BOT_NAME}:\n\n" (nome com dois pontos, depois linha em branco, depois o texto da mensagem).
- A mensagem DEVE ser organizada em parágrafos curtos separados por linha em branco. Exemplo de estrutura:
  ${BOT_NAME}:

  Primeiro parágrafo com saudação ou contexto.

  Segundo parágrafo com a informação principal.

  Terceiro parágrafo com orientação ou pergunta.
- NUNCA escreva a resposta inteira em um único bloco de texto. Sempre separe em trechos.
${formattingInstruction}
${closingInstruction}
${toneInstruction}
${dateAccuracyInstruction}
- Seja objetivo e natural. Não exagere no entusiasmo nem repita frases já ditas.
- NÃO invente informações que não estejam nos dados acima.
- Quando finalizar o atendimento normalmente, inclua ${BOT_DONE_MARKER} ao fim (apenas uma vez).

## Exemplos de encerramentos variados (use variações, nunca repita o mesmo)

${closingExamples}`;
}

// ============================================================
// Audio helpers — Whisper (STT) + TTS
// ============================================================

/**
 * Transcreve áudio (base64 OGG/MP3) via OpenAI Whisper.
 * Retorna o texto transcrito ou null em caso de falha.
 */
export async function transcribeAudio(audioBase64: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !audioBase64) {
    console.error("[Chatbot/STT] API key ausente ou audioBase64 vazio");
    return null;
  }

  try {
    // Strip data URI prefix se presente (ex: "data:audio/ogg;base64,...")
    const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, "");
    const audioBuffer = Buffer.from(cleanBase64, "base64");
    console.log(`[Chatbot/STT] Áudio recebido: ${audioBuffer.length} bytes`);

    if (audioBuffer.length < 100) {
      console.error("[Chatbot/STT] Áudio muito pequeno, provavelmente inválido");
      return null;
    }

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: "audio/ogg" });
    formData.append("file", blob, "audio.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    console.log("[Chatbot/STT] Enviando para Whisper...");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[Chatbot/STT] Whisper error ${response.status}:`, errBody);
      return null;
    }

    const data = await response.json();
    const text = (data.text as string)?.trim() || null;
    console.log(`[Chatbot/STT] Transcrição: "${text}"`);
    return text;
  } catch (err) {
    console.error("[Chatbot/STT] Erro na transcrição:", err);
    return null;
  }
}

/**
 * Gera áudio TTS a partir de texto usando a voz "marin".
 * Retorna base64 MP3 ou null em caso de falha.
 */
function prepareTextForSpeech(text: string): string {
  const escapedTextCompanionStart = TEXT_COMPANION_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedTextCompanionEnd = TEXT_COMPANION_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return text
    .replace(new RegExp(`${escapedTextCompanionStart}[\\s\\S]*?${escapedTextCompanionEnd}`, "g"), "")
    .replace(new RegExp(`^${BOT_NAME}:\\s*`, "i"), "")
    .replace(BOT_DONE_MARKER, "")
    .replace(BOT_ESCALATE_MARKER, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^[\-\u2022]\s+/gm, "")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

function extractTextCompanion(text: string): { cleanedText: string; textCompanion: string | null } {
  const escapedTextCompanionStart = TEXT_COMPANION_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedTextCompanionEnd = TEXT_COMPANION_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const companionRegex = new RegExp(`${escapedTextCompanionStart}\\s*([\\s\\S]*?)\\s*${escapedTextCompanionEnd}`, "i");
  const match = text.match(companionRegex);
  const companionBody = match?.[1]?.trim() || null;
  const cleanedText = text.replace(companionRegex, "").trim();

  if (!companionBody) {
    return { cleanedText, textCompanion: null };
  }

  const normalizedCompanion = companionBody.startsWith(`${BOT_NAME}:`)
    ? companionBody
    : `${BOT_NAME}:\n\n${companionBody}`;

  return {
    cleanedText,
    textCompanion: normalizedCompanion,
  };
}

function buildFallbackTextCompanion(
  responseMode: ResponseMode,
  incomingMessage: string,
  _botText: string
): string | null {
  if (responseMode !== "audio") return null;

  const normalizedIncoming = incomingMessage.toLowerCase();
  const needsAppLink =
    /(como|onde|qual).*(entrar|acessar|abrir).*(app|site|portal)|link.*(app|site)|entrar.*(app|site)|acessar.*(app|site)|abrir.*(app|site)|login.*(app|site)/.test(
      normalizedIncoming
    );

  if (!needsAppLink) return null;

  return `${BOT_NAME}:\n\nSe precisar abrir o app agora, segue o link oficial:\n${APP_PUBLIC_URL}`;
}

function ensureAudioMentionsTextCompanion(
  responseMode: ResponseMode,
  botText: string,
  textCompanion: string | null
): string {
  if (responseMode !== "audio" || !textCompanion) {
    return botText;
  }

  const lowerBotText = botText.toLowerCase();
  const alreadyMentionsCompanion =
    /vou te mandar|vou te enviar|te envio|te mando|por aqui|por escrito|na conversa|no link/.test(lowerBotText);

  if (alreadyMentionsCompanion) {
    return botText;
  }

  const companionBody = textCompanion.replace(new RegExp(`^${BOT_NAME}:\\s*`, "i"), "").trim();
  const companionMentionsLink = /https?:\/\/|cdmf\.vercel\.app|link/.test(companionBody.toLowerCase());
  const addition = companionMentionsLink
    ? " Vou te enviar o link por aqui e, se precisar, eu sigo te ajudando."
    : " Também vou te deixar isso por escrito aqui na conversa para facilitar.";

  if (botText.endsWith(".") || botText.endsWith("!") || botText.endsWith("?")) {
    return `${botText}${addition}`;
  }

  return `${botText}.${addition}`;
}

function normalizeElevenLabsModelId(value?: string): string {
  const normalized = (value || "").trim().toLowerCase();

  if (!normalized) return DEFAULT_ELEVENLABS_MODEL_ID;
  if (
    normalized === "multilingual v2" ||
    normalized === "multilingual-v2" ||
    normalized === DEFAULT_ELEVENLABS_MODEL_ID
  ) {
    return DEFAULT_ELEVENLABS_MODEL_ID;
  }

  return value!.trim();
}

async function generateSpeech(text: string): Promise<string | null> {
  try {
    // Remove prefixo "Juliana:\n\n", emojis e formatação markdown antes de enviar ao TTS
    const cleanText = prepareTextForSpeech(text);

    if (!cleanText) {
      console.error("[Chatbot/TTS] Texto vazio após limpeza");
      return null;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
    const modelId = normalizeElevenLabsModelId(process.env.ELEVENLABS_MODEL_ID);

    if (!apiKey || !voiceId) {
      console.error("[Chatbot/TTS] ELEVENLABS_API_KEY ou ELEVENLABS_VOICE_ID ausente");
      return null;
    }

    console.log(`[Chatbot/TTS] Gerando fala (${cleanText.length} chars), voz: ${voiceId}, modelo: ${modelId}`);
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: modelId,
        output_format: "mp3_44100_128",
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[Chatbot/TTS] ElevenLabs erro ${response.status}:`, errBody);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    console.log(`[Chatbot/TTS] Áudio gerado via ElevenLabs: ${base64.length} chars base64`);
    return base64;
  } catch (err) {
    console.error("[Chatbot/TTS] Erro ao gerar fala:", err);
    return null;
  }
}

// ============================================================
// Types
// ============================================================

type SendTextFn = (phone: string, text: string) => Promise<string | undefined>;
type SendAudioFn = (phone: string, audioBase64: string) => Promise<string | undefined>;

// ============================================================
// Main entry point
// ============================================================

export async function processChatbotReply(
  conversationId: string,
  studentPhone: string,
  studentName: string,
  incomingMessage: string,
  sendText: SendTextFn,
  sendAudio?: SendAudioFn,
  respondWithAudio?: boolean
): Promise<void> {
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openAiApiKey) return;

  try {
    const conversation = await getDocument("whatsapp_conversations", conversationId);
    if (!conversation) return;

    const botPhase = conversation.botPhase as string | undefined;

    // Bot desativado manualmente — nunca responde
    if (botPhase === "disabled") return;

    // Conversa resolvida por humano — não interfere
    if (conversation.status === "resolved") return;

    // Se o bot já concluiu mas o usuário enviou nova mensagem, reinicia o ciclo
    let botTurns = Number(conversation.botTurns || 0);

    if (botPhase === "completed") {
      await updateDocument("whatsapp_conversations", conversationId, {
        botPhase: "active",
        botTurns: 0,
        updatedAt: Date.now(),
      });
      botTurns = 0;
    }

    if (botTurns >= MAX_BOT_TURNS) {
      await updateDocument("whatsapp_conversations", conversationId, { botPhase: "completed" });
      return;
    }

    const responseMode: ResponseMode = respondWithAudio ? "audio" : "text";

    // Verificar pagamentos aprovados que ainda não foram notificados (fire-and-forget)
    const studentId = String(conversation.studentId || "");
    if (studentId) {
      checkAndNotifyPaidInvoices(studentId, studentPhone).catch((err: unknown) =>
        console.error("[Chatbot] Erro ao verificar pagamentos pendentes de notificação:", err)
      );
    }

    // Buscar histórico e contexto em paralelo
    const [schoolContext, recentMessages] = await Promise.all([
      getSchoolContext(responseMode, studentId, studentPhone),
      listDocuments("whatsapp_messages", [
        { type: "where", field: "conversationId", op: "==", value: conversationId },
        { type: "orderBy", field: "timestamp", direction: "desc" },
        { type: "limit", value: 20 },
      ]),
    ]);

    const history = recentMessages
      .reverse()
      .filter((m) => {
        const type = m.data.type as string | undefined;
        // Inclui texto e áudio (transcrição) no contexto do LLM
        return !type || type === "text" || type === "audio";
      })
      .map((m) => {
        const role = m.data.from === "student" ? "user" : "assistant";
        let content = String(m.data.content || "");
        // Remove marcador de áudio 🎤 para contexto limpo
        content = content.replace(/^🎤\s*/, "");
        // Normaliza prefixo de nomes antigos do bot para o nome atual
        if (role === "assistant") {
          content = content.replace(/^Assistente de IA:\s*/i, `${BOT_NAME}:\n\n`);
          content = content.replace(/^Juliana:\n*/i, `${BOT_NAME}:\n\n`);
        }
        return { role, content };
      })
      .filter((m) => m.content && m.content !== "[Áudio]") as Array<{ role: "user" | "assistant"; content: string }>;

    // Se a última mensagem do usuário não está no histórico (ex: áudio sem transcrição no banco),
    // injeta o incomingMessage para que o LLM tenha contexto
    const lastUserInHistory = [...history].reverse().find((m) => m.role === "user");
    if (!lastUserInHistory && incomingMessage && incomingMessage !== "[Áudio]") {
      history.push({ role: "user", content: incomingMessage });
    }

    // Detecção de repetição — verifica se o usuário repetiu a mesma solicitação
    const userMessages = history.filter((m) => m.role === "user");
    if (userMessages.length >= REPETITION_THRESHOLD + 1) {
      const recent = userMessages.slice(-REPETITION_THRESHOLD - 1);
      const normalized = recent.map((m) =>
        m.content.toLowerCase().replace(/[^a-záéíóúàãõâêîôûç\s]/gi, "").trim()
      );
      // Verifica se as últimas N mensagens são muito similares (palavras em comum > 60%)
      const repetitionDetected = normalized.slice(1).every((msg) => {
        const wordsA = new Set(normalized[0].split(/\s+/).filter((w) => w.length > 3));
        const wordsB = new Set(msg.split(/\s+/).filter((w) => w.length > 3));
        if (wordsA.size === 0) return false;
        const common = [...wordsA].filter((w) => wordsB.has(w)).length;
        return common / wordsA.size >= 0.6;
      });

      if (repetitionDetected) {
        console.log("[Chatbot] Repetição detectada — escalando para gestor");
        const escalateMsg = `${BOT_NAME}:\n\nEntendi, e obrigada por avisar de novo.\n\nVou confirmar isso certinho com a equipe da gestão para te passar a resposta correta. Pode ficar tranquilo que seguimos por aqui.`;
        if (respondWithAudio && sendAudio) {
          const audioBase64 = await generateSpeech(escalateMsg);
          if (audioBase64) {
            await sendAudio(studentPhone, audioBase64);
          } else {
            await sendText(studentPhone, escalateMsg);
          }
        } else {
          await sendText(studentPhone, escalateMsg);
        }
        const now = Date.now();
        await setDocument("whatsapp_messages", makeId("wamsg"), {
          conversationId,
          from: "business",
          type: respondWithAudio ? "audio" : "text",
          content: escalateMsg,
          status: "sent",
          timestamp: now,
          sentBy: "chatbot",
        });
        await updateDocument("whatsapp_conversations", conversationId, {
          lastMessage: escalateMsg.substring(0, 100),
          lastMessageAt: now,
          lastMessageFrom: "business",
          updatedAt: now,
          botPhase: "disabled",
          botTurns: botTurns + 1,
        });
        return;
      }
    }

    // Primeira mensagem = sem histórico de respostas do bot
    const isFirstMessage = !history.some((m) => m.role === "assistant");

    // Extrai o primeiro nome do usuário
    const studentFirstName = (studentName || "").trim().split(/\s+/)[0] || "";

    const baseSystemPrompt = buildSystemPrompt(schoolContext, isFirstMessage, studentFirstName, responseMode);
    const systemPrompt =
      responseMode === "audio"
        ? `${baseSystemPrompt}\n\n${AUDIO_RESPONSE_PROMPT}`
        : baseSystemPrompt;

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
        ],
        max_tokens: responseMode === "audio" ? 220 : 700,
        temperature: 0.7,
      }),
    });

    if (!openAiResponse.ok) {
      const err = await openAiResponse.text().catch(() => "");
      console.error(`[Chatbot] OpenAI error ${openAiResponse.status}:`, err);
      return;
    }

    const openAiData = await openAiResponse.json();
    let botText: string = openAiData?.choices?.[0]?.message?.content || "";
    if (!botText) return;

    // Detecção de resposta "congelada": o LLM prometeu uma ação (pagar, gerar PIX, criar cobrança,
    // enviar código, verificar, aguardar) mas não incluiu nenhum marcador de ação.
    // Nesse caso, buscamos diretamente as cobranças/eventos pendentes do aluno e injetamos o marcador.
    const hasActionMarker = botText.includes(BOT_PIX_MARKER) || botText.includes(BOT_VOUCHER_MARKER) ||
      botText.includes(BOT_DONE_MARKER) || botText.includes(BOT_ESCALATE_MARKER);
    if (!hasActionMarker) {
      const stalledPattern = /(aguard|verificar|verifico|consultar|consulto|um momento|um instante|vou checar|vou conferir|deixa eu ver|vou buscar|vou procurar|já retorno|já volto|vou criar|vou gerar|vou enviar|te envio|estou gerando|estou criando|vou preparar|gerando o|criando a|enviando o|preparando)/i;
      const promisedPix = /(pix|código|pagamento|cobranç|pagar|gerar.*pix|gerar.*código)/i;
      const promisedVoucher = /(ingresso|voucher|ticket|entrada.*evento)/i;

      if (stalledPattern.test(botText)) {
        console.log("[Chatbot] Resposta congelada detectada. Resolvendo ação diretamente...");
        const convStudentId = String(conversation.studentId || "");

        if (convStudentId && (promisedPix.test(botText) || promisedVoucher.test(botText))) {
          // Buscar cobranças pendentes do aluno
          const pendingInvoices = await listDocuments("invoices", [
            { type: "where", field: "studentId", op: "==", value: convStudentId },
            { type: "limit", value: 50 },
          ]);
          const pending = pendingInvoices.filter((inv) => {
            const s = String((inv.data as any).status || "");
            return s === "pending" || s === "overdue";
          });

          if (promisedPix.test(botText) && pending.length > 0) {
            // Injetar marcador PIX para a primeira cobrança pendente
            const targetInvoice = pending[0];
            console.log(`[Chatbot] Injetando marcador PIX para invoice ${targetInvoice.id}`);
            botText += ` ${BOT_PIX_MARKER}${targetInvoice.id}]`;
          } else if (promisedVoucher.test(botText)) {
            // Buscar eventos ativos para injetar marcador de voucher
            const events = await listDocuments("events", [
              { type: "where", field: "active", op: "==", value: true },
              { type: "limit", value: 10 },
            ]);
            const todayISO = getTodayISOInSchoolTimezone();
            const upcoming = events.filter((e) => String((e.data as any).date || "") >= todayISO);
            if (upcoming.length > 0) {
              // Tentar identificar o evento mencionado no texto do bot
              const matchedEvent = upcoming.find((e) => {
                const name = String((e.data as any).name || "").toLowerCase();
                return botText.toLowerCase().includes(name);
              }) || upcoming[0];
              console.log(`[Chatbot] Injetando marcador VOUCHER para evento ${matchedEvent.id}`);
              botText += ` ${BOT_VOUCHER_MARKER}${matchedEvent.id}]`;
            }
          }
        }

        // Limpar linguagem de espera do texto que será enviado ao aluno
        botText = botText
          .replace(/[,.]?\s*(aguarde|aguarda|um momento|um instante)[^.!]*[.!]?/gi, ".")
          .replace(/\.\s*\./g, ".")
          .trim();
      }
    }

    const isDone = botText.includes(BOT_DONE_MARKER);
    const isEscalating = botText.includes(BOT_ESCALATE_MARKER);

    // Detectar marcador PIX: [GERAR_PIX:invoiceId]
    let pixInvoiceId: string | null = null;
    const pixMatch = botText.match(/\[GERAR_PIX:([^\]]+)\]/);
    if (pixMatch) {
      pixInvoiceId = pixMatch[1].trim();
      console.log(`[Chatbot] PIX marker detectado para invoice: ${pixInvoiceId}`);
    }

    // Detectar marcador VOUCHER: [GERAR_VOUCHER:eventId] ou [GERAR_VOUCHER:eventId:ACOMPANHANTE:nome]
    let voucherEventId: string | null = null;
    let voucherGuestName: string | null = null;
    const voucherMatch = botText.match(/\[GERAR_VOUCHER:([^\]]+)\]/);
    if (voucherMatch) {
      const parts = voucherMatch[1].trim().split(":ACOMPANHANTE:");
      voucherEventId = parts[0].trim();
      if (parts.length > 1) {
        voucherGuestName = parts[1].trim();
      }
      console.log(`[Chatbot] VOUCHER marker detectado: evento=${voucherEventId}, acompanhante=${voucherGuestName || "não"}`);
    }

    botText = botText
      .replace(BOT_DONE_MARKER, "")
      .replace(BOT_ESCALATE_MARKER, "")
      .replace(/\[GERAR_PIX:[^\]]+\]/g, "")
      .replace(/\[GERAR_VOUCHER:[^\]]+\]/g, "")
      .trim();

    const { cleanedText, textCompanion } = extractTextCompanion(botText);
    botText = cleanedText;

    // Garantir prefixo correto (fallback caso o modelo não siga)
    if (!botText.startsWith(`${BOT_NAME}:`)) {
      botText = `${BOT_NAME}:\n\n${botText}`;
    }

    const fallbackTextCompanion = buildFallbackTextCompanion(responseMode, incomingMessage, botText);
    const finalTextCompanion = textCompanion || fallbackTextCompanion;
    botText = ensureAudioMentionsTextCompanion(responseMode, botText, finalTextCompanion);

    // Iniciar geração do PIX em paralelo com envio da mensagem do bot
    const pixPromise = pixInvoiceId
      ? createPixPaymentForBot(pixInvoiceId).catch((err) => {
          console.error(`[Chatbot] Erro ao gerar PIX:`, err);
          return null;
        })
      : null;

    // Enviar resposta: áudio se o usuário enviou áudio, texto caso contrário
    console.log(`[Chatbot] respondWithAudio=${respondWithAudio}, sendAudio=${!!sendAudio}`);
    if (respondWithAudio && sendAudio) {
      console.log("[Chatbot] Gerando TTS para resposta em áudio...");
      const audioBase64 = await generateSpeech(botText);
      if (audioBase64) {
        console.log("[Chatbot] TTS gerado, enviando áudio...");
        await sendAudio(studentPhone, audioBase64);
        console.log("[Chatbot] Áudio enviado com sucesso");
      } else {
        console.error("[Chatbot] TTS falhou, enviando texto como fallback");
        await sendText(studentPhone, botText);
      }
    } else {
      await sendText(studentPhone, botText);
    }

    if (finalTextCompanion) {
      await sendText(studentPhone, finalTextCompanion);
    }

    // Aguardar resultado do PIX (já estava sendo gerado em paralelo)
    let pixMessage: string | null = null;
    if (pixPromise) {
      console.log(`[Chatbot] Aguardando PIX para invoice ${pixInvoiceId}...`);
      const pixResult = await pixPromise;
      if (pixResult && pixResult.success && pixResult.pixCode) {
        const amountInReais = (pixResult.amount || 0) / 100;
        const amountFormatted = amountInReais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        pixMessage = `💳 *PIX Gerado com Sucesso!*\n\n` +
          `📋 *${pixResult.description}*\n` +
          `💰 Valor: *${amountFormatted}*\n\n` +
          `✅ O pagamento será confirmado automaticamente e você será avisado aqui no WhatsApp.\n\n` +
          `Código PIX logo abaixo, basta copiar e fazer o pagamento 👇`;
        await sendText(studentPhone, pixMessage);
        await sendText(studentPhone, pixResult.pixCode);
        console.log(`[Chatbot] PIX enviado para ${studentPhone}: ${amountFormatted}`);
      } else if (pixResult) {
        // Falha com motivo específico
        const desc = pixResult.description ? ` (*${pixResult.description}*)` : "";
        switch (pixResult.reason) {
          case "already_paid":
            pixMessage = `✅ Essa cobrança${desc} já está *paga*! Não é necessário gerar um novo PIX.\n\nSe precisar do comprovante ou tiver alguma dúvida, é só me dizer!`;
            break;
          case "cancelled":
            pixMessage = `⚠️ Essa cobrança${desc} foi *cancelada* e não pode mais ser paga.\n\nSe achar que isso está errado, entre em contato com a secretaria.`;
            break;
          case "not_found":
            pixMessage = `❌ Não encontrei essa cobrança no sistema. Verifique se o código está correto ou entre em contato com a secretaria.`;
            break;
          case "invalid_amount":
            pixMessage = `❌ O valor dessa cobrança${desc} está inválido no sistema. Entre em contato com a secretaria para corrigir.`;
            break;
          case "invalid_status":
            pixMessage = `⚠️ Essa cobrança${desc} está com o status *${pixResult.invoiceStatus || "desconhecido"}* e não pode receber pagamento no momento.`;
            break;
          default:
            pixMessage = `❌ Não foi possível gerar o PIX para esta cobrança no momento. Por favor, tente novamente mais tarde ou entre em contato com a secretaria.`;
        }
        await sendText(studentPhone, pixMessage);
        console.log(`[Chatbot] PIX não gerado para invoice ${pixInvoiceId}: ${pixResult.reason}`);
      } else {
        pixMessage = `❌ Ocorreu um erro inesperado ao gerar o PIX. Por favor, tente novamente mais tarde.`;
        await sendText(studentPhone, pixMessage);
        console.error(`[Chatbot] PIX retornou null para invoice ${pixInvoiceId}`);
      }
    }

    // Processar geração de voucher se marcador foi detectado
    let voucherMessage: string | null = null;
    if (voucherEventId) {
      // Resolver studentId pela conversa ou pelo telefone
      let convStudentId = String(conversation.studentId || "");
      if (!convStudentId && studentPhone) {
        const phoneMatch = await findStudentProfileByPhone(studentPhone);
        if (phoneMatch) {
          convStudentId = phoneMatch.id;
          // Atualizar conversa para futuras chamadas
          await updateDocument("whatsapp_conversations", conversationId, { studentId: convStudentId });
        }
      }
      if (!convStudentId) {
        voucherMessage = `ℹ️ Não encontrei um cadastro vinculado a esse número de WhatsApp.\n\nPara gerar ingressos, o número do WhatsApp precisa ser o mesmo cadastrado no app do CDMF.`;
        await sendText(studentPhone, voucherMessage);
      } else {
        try {
          console.log(`[Chatbot] Gerando voucher: evento=${voucherEventId}, aluno=${convStudentId}, acompanhante=${voucherGuestName || "não"}`);

          // Para acompanhante, buscar o voucher principal do aluno
          let parentVoucherId: string | undefined;
          if (voucherGuestName) {
            const parentVouchers = await listDocuments("vouchers", [
              { type: "where", field: "studentId", op: "==", value: convStudentId },
              { type: "limit", value: 50 },
            ]);
            const event = await getDocument("events", voucherEventId);
            const eventName = event ? String(event.name || "") : "";
            const parentVoucher = parentVouchers.find((v) => {
              const d = v.data as any;
              return d.eventName === eventName && d.status === "valid" && !d.isGuest;
            });
            parentVoucherId = parentVoucher?.id;
          }

          const result = await createEventVoucherForBot(voucherEventId, convStudentId, voucherGuestName || undefined, parentVoucherId);

          if (result.success && result.voucher && !result.needsPayment) {
            // Voucher gerado ou já existia
            const isExisting = result.reason === "already_has_voucher";
            const dateStr = result.voucher.eventDate ? result.voucher.eventDate.split("-").reverse().join("/") : "";
            voucherMessage = isExisting
              ? `🎟️ *Você já tem ingresso para este evento!*\n\n` +
                `🎉 *${result.voucher.eventName}*\n` +
                (dateStr ? `📅 Data: *${dateStr}*\n\n` : "\n") +
                `✅ *Seu voucher:* ${result.voucher.voucherCode}\n\n` +
                `Guarde este código para a entrada do evento 💜\n\n` +
                `Quer levar um acompanhante? É só me dizer o nome!`
              : `🎟️ *Ingresso Gerado!*\n\n` +
                `🎉 *${result.voucher.eventName}*\n` +
                (dateStr ? `📅 Data: *${dateStr}*\n\n` : "\n") +
                `✅ *Seu voucher:* ${result.voucher.voucherCode}\n\n` +
                `Guarde este código para a entrada do evento 💜\n\n` +
                `Quer levar um acompanhante? É só me dizer o nome!`;
            await sendText(studentPhone, voucherMessage);
          } else if (result.success && result.needsPayment && result.invoice) {
            // Evento pago — enviou PIX
            const amountInReais = result.invoice.amount / 100;
            const amountFormatted = amountInReais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            voucherMessage = `🎟️ *Ingresso - Pagamento Necessário*\n\n` +
              `📋 *${result.invoice.description}*\n` +
              `💰 Valor: *${amountFormatted}*\n\n` +
              `✅ Após o pagamento, seu voucher será gerado automaticamente e enviado aqui no WhatsApp.\n\n` +
              `Código PIX logo abaixo, basta copiar e fazer o pagamento 👇`;
            await sendText(studentPhone, voucherMessage);
            if (result.pixCode) {
              await sendText(studentPhone, result.pixCode);
            }
          } else {
            // Falha — mensagem contextual sem parecer erro de sistema
            switch (result.reason) {
              case "voucher_already_used":
                voucherMessage = `ℹ️ Seu ingresso para este evento já foi *utilizado*. Caso precise de ajuda, entre em contato com a secretaria!`;
                break;
              case "event_not_found":
                voucherMessage = `ℹ️ Não encontrei esse evento no sistema. Pode ser que o nome ou código esteja diferente. Quer que eu verifique os eventos disponíveis?`;
                break;
              case "event_inactive":
                voucherMessage = `ℹ️ Esse evento não está mais ativo no momento. Quer saber sobre outros eventos disponíveis?`;
                break;
              case "student_not_found":
                voucherMessage = `ℹ️ Não consegui localizar seu cadastro para gerar o ingresso. Pode entrar em contato com a secretaria para que possam te ajudar!`;
                break;
              default:
                voucherMessage = `ℹ️ Não consegui gerar o ingresso agora. Quer que eu verifique os eventos disponíveis para você?`;
            }
            await sendText(studentPhone, voucherMessage);
          }
          console.log(`[Chatbot] Voucher processado para ${studentPhone}`);
        } catch (voucherError) {
          console.error(`[Chatbot] Erro ao gerar voucher:`, voucherError);
          voucherMessage = `❌ Ocorreu um erro ao gerar o ingresso. Por favor, tente novamente mais tarde.`;
          await sendText(studentPhone, voucherMessage);
        }
      }
    }

    const now = Date.now();
    const messageId = makeId("wamsg");
    await setDocument("whatsapp_messages", messageId, {
      conversationId,
      from: "business",
      type: respondWithAudio ? "audio" : "text",
      content: botText,
      status: "sent",
      timestamp: now,
      sentBy: "chatbot",
    });

    if (finalTextCompanion) {
      await setDocument("whatsapp_messages", makeId("wamsg"), {
        conversationId,
        from: "business",
        type: "text",
        content: finalTextCompanion,
        status: "sent",
        timestamp: now + 1,
        sentBy: "chatbot",
      });
    }

    if (pixMessage) {
      await setDocument("whatsapp_messages", makeId("wamsg"), {
        conversationId,
        from: "business",
        type: "text",
        content: pixMessage,
        status: "sent",
        timestamp: now + 2,
        sentBy: "chatbot",
      });
    }

    if (voucherMessage) {
      await setDocument("whatsapp_messages", makeId("wamsg"), {
        conversationId,
        from: "business",
        type: "text",
        content: voucherMessage,
        status: "sent",
        timestamp: now + 3,
        sentBy: "chatbot",
      });
    }

    const lastMsg = voucherMessage || pixMessage || finalTextCompanion || botText;
    const lastMsgAt = voucherMessage ? now + 3 : pixMessage ? now + 2 : finalTextCompanion ? now + 1 : now;
    await updateDocument("whatsapp_conversations", conversationId, {
      lastMessage: lastMsg.substring(0, 100),
      lastMessageAt: lastMsgAt,
      lastMessageFrom: "business",
      updatedAt: lastMsgAt,
      botTurns: botTurns + 1,
      botPhase: isDone ? "completed" : isEscalating ? "disabled" : "active",
    });
  } catch (error) {
    console.error("[Chatbot] Erro ao processar resposta:", error);
  }
}

// ============================================================
// Utilitários de controle do bot (chamados via RPC)
// ============================================================

export async function setBotPhase(
  conversationId: string,
  phase: "active" | "completed" | "disabled"
): Promise<{ success: boolean }> {
  await updateDocument("whatsapp_conversations", conversationId, {
    botPhase: phase,
    updatedAt: Date.now(),
  });
  return { success: true };
}

export async function getChatbotStatus(): Promise<{ enabled: boolean; model: string }> {
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  return { enabled: hasKey, model: OPENAI_MODEL };
}
