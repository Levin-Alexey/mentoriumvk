export const PERSONAL_EFFICIENCY_COMMAND = "direction_personal_efficiency";
import { PERSONAL_STUDY_AI_COMMAND } from "./personalStudyAi.js";

const PERSONAL_START_VIDEO_ATTACHMENT = "video-238551367_456239019_d15fbed29865cb467b";
const PERSONAL_EFFICIENCY_BONUS_COINS = 50;

async function sendVkMessage(token, params) {
	const response = await fetch("https://api.vk.com/method/messages.send", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			access_token: token,
			v: "5.199",
			...params
		})
	});
	const data = await response.json();
	if (data.error) throw new Error(`VK API error: ${data.error.error_msg}`);
	return data.response;
}

export async function handlePersonalEfficiencySelection({ env, userId, peerId, payload }) {
	try {
		const vkId = Number(userId);
		
		// Get database user ID from VK ID
		const userRow = await env.DB.prepare(
			"SELECT id FROM users WHERE vk_id = ? LIMIT 1"
		).bind(vkId).first();

		if (!userRow?.id) {
			throw new Error(`User not found for vk_id: ${vkId}`);
		}

		const dbUserId = Number(userRow.id);

		// 1. Send video attachment
		await sendVkMessage(env.SK, {
			peer_id: String(peerId),
			attachment: PERSONAL_START_VIDEO_ATTACHMENT,
			random_id: String(Date.now() % 2147483647)
		});

		// 2. Send follow-up text with keyboard
		const followUpText = `🤯 Эра Искусственного Интеллекта меняет жизнь.
Теперь аватары и агенты делают большую часть рутинной работы.
Пока мой цифровой аватар общался с Вами, я пил кофе или учил корейский язык 🤪.

Именно так выглядит личная эффективность с ИИ. Вы перестаете быть «белкой в колесе» и становитесь архитектором своей жизни.

🔥 На вебинаре за 1 час Вы научитесь:
✅ Писать письма и отчеты за минуты (вместо часов мучений).
✅ Делать презентации и картинки, не будучи дизайнером.
✅ Учиться новому в 10 раз быстрее с персональным ИИ-ментором.

🎁 Ваш подарок уже ждет! Я открываю Вам доступ в закрытый канал, где уже лежит база лучших нейросетей и самые полезные промпты.

👇 Жми кнопку, чтобы забрать доступ и закрепить за собой место на эфире!`;

		const keyboard = {
			inline: true,
			buttons: [
				[
					{
						action: {
							type: "text",
							label: "🔥ХОЧУ ИЗУЧАТЬ ИИ🔥",
							payload: JSON.stringify({ command: PERSONAL_STUDY_AI_COMMAND })
						},
						color: "positive"
					}
				]
			]
		};

		await sendVkMessage(env.SK, {
			peer_id: String(peerId),
			message: followUpText,
			keyboard: JSON.stringify(keyboard),
			random_id: String((Date.now() + 1) % 2147483647)
		});

		// 3. Award bonus coins
		await env.DB.prepare(
			`INSERT INTO ai_coin_operations (user_id, amount, operation_type, reason, description, created_at)
			 VALUES (?, ?, 'earned', 'direction_selection', 'Bonus for selecting personal efficiency direction', datetime('now'))`
		).bind(dbUserId, PERSONAL_EFFICIENCY_BONUS_COINS).run();

		// 4. Update user direction
		await env.DB.prepare(
			`UPDATE users SET direction = 'personal' WHERE id = ?`
		).bind(dbUserId).run();

		console.log("Personal efficiency handler completed:", {
			vkId,
			dbUserId,
			peerId,
			coinsAwarded: PERSONAL_EFFICIENCY_BONUS_COINS
		});

		return { success: true };

	} catch (error) {
		console.error("Error in handlePersonalEfficiencySelection:", error);
		throw error;
	}
}
