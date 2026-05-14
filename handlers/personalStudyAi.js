export const PERSONAL_STUDY_AI_COMMAND = "personal_study_ai";
import { PERSONAL_CONFIRM_PARTICIPATION_COMMAND } from "./personalConfirmParticipation.js";

async function sendVkMessage(token, params) {
	const response = await fetch("https://api.vk.com/method/messages.send", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			access_token: token,
			v: "5.199",
			...params,
		}),
	});
	const data = await response.json();
	if (data.error) {
		throw new Error(`VK API error: ${data.error.error_msg}`);
	}
	return data.response;
}

function formatWebinarDateTime(webinarDateRaw) {
	const source = String(webinarDateRaw ?? "").trim();
	if (!source) {
		return { date: "уточняется", time: "уточняется" };
	}

	const isoMatch = source.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
	if (isoMatch) {
		const [, year, month, day, hour, minute] = isoMatch;
		return {
			date: `${day}.${month}.${year}`,
			time: `${hour}:${minute}`,
		};
	}

	const ruMatch = source.match(/^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})/);
	if (ruMatch) {
		const [, day, month, year, hour, minute] = ruMatch;
		return {
			date: `${day}.${month}.${year}`,
			time: `${hour}:${minute}`,
		};
	}

	return { date: source, time: "уточняется" };
}

async function getWebinarDateTime(env) {
	if (!env?.DB) {
		return { date: "уточняется", time: "уточняется" };
	}

	const nextRow = await env.DB.prepare(
		`SELECT webinar_date
		 FROM webinars
		 WHERE datetime(webinar_date) >= datetime('now')
		 ORDER BY datetime(webinar_date) ASC
		 LIMIT 1`
	).first();

	if (nextRow?.webinar_date) {
		return formatWebinarDateTime(nextRow.webinar_date);
	}

	const fallbackRow = await env.DB.prepare(
		`SELECT webinar_date
		 FROM webinars
		 ORDER BY datetime(webinar_date) DESC
		 LIMIT 1`
	).first();

	return formatWebinarDateTime(fallbackRow?.webinar_date);
}

export async function handlePersonalStudyAiSelection({ env, userId, peerId, payload }) {
	try {
		const token = env?.SK;
		if (!token) {
			throw new Error("SK token is not configured");
		}

		const { date, time } = await getWebinarDateTime(env);

		const messageText = `🏁 Финишная прямая!
🗓 Дата: ${date}
⏰ Время: ${time} МСК
📍 Место: Онлайн

⚠️ Важно: Чтобы забрать Базу нейросетей и активировать доступ к закрытой группе, нажмите финальную кнопку регистрации.

За это действие я начислю еще +100 монет! 🪙
👇 Нажимайте кнопку ниже и до встречи на вебинаре!`;

		const keyboard = {
			inline: true,
			buttons: [
				[
					{
						action: {
							type: "text",
							label: "🔥ПОДТВЕРДИТЬ УЧАСТИЕ🔥",
							payload: JSON.stringify({ command: PERSONAL_CONFIRM_PARTICIPATION_COMMAND }),
						},
						color: "positive",
					},
				],
			],
		};

		await sendVkMessage(token, {
			peer_id: String(peerId),
			message: messageText,
			keyboard: JSON.stringify(keyboard),
			random_id: String(Date.now() % 2147483647),
		});

		console.log("Personal study AI handler completed:", JSON.stringify({
			userId,
			peerId,
			payload,
			date,
			time,
		}));
	} catch (error) {
		console.error("Error in handlePersonalStudyAiSelection:", error);
		throw error;
	}
}