export const PERSONAL_CONFIRM_PARTICIPATION_COMMAND = "personal_confirm_participation";

const CONFIRM_PARTICIPATION_BONUS_COINS = 100;
const CONFIRM_PHOTO_ATTACHMENT = "photo175946972_457239730_a997df1ebdd0695c7b";

const SECRET_CHAT_URL = "https://vk.me/join/mxVRY5Y61AEA2xBx_aDqE8uK7jhda89cbxI=";
const SUPPORT_URL = "https://vk.me/join/w5h2/jrK/oicp9ZtXfZXkLOZ07mhmG9w7tA=";

export const SPEAKER_INFO_COMMAND = "speaker_info";

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

export async function handlePersonalConfirmParticipation({ env, userId, peerId, payload }) {
	try {
		const token = env?.SK;
		if (!token) throw new Error("SK token is not configured");

		const vkId = Number(userId);

		// Get DB user
		const userRow = await env.DB.prepare(
			"SELECT id, ai_coins_balance FROM users WHERE vk_id = ? LIMIT 1"
		).bind(vkId).first();

		if (!userRow?.id) throw new Error(`User not found for vk_id: ${vkId}`);

		const dbUserId = Number(userRow.id);

		// Get nearest webinar ID
		const webinarRow = await env.DB.prepare(
			`SELECT id FROM webinars
			 ORDER BY datetime(webinar_date) DESC
			 LIMIT 1`
		).first();

		if (!webinarRow?.id) throw new Error("No webinar found in DB");

		const webinarId = Number(webinarRow.id);

		// 1. Insert registration (ignore if already exists)
		await env.DB.prepare(
			`INSERT OR IGNORE INTO webinar_registrations (user_id, webinar_id)
			 VALUES (?, ?)`
		).bind(dbUserId, webinarId).run();

		// 2. Award bonus coins
		await env.DB.prepare(
			`INSERT INTO ai_coin_operations (user_id, amount, operation_type, reason, description, created_at)
			 VALUES (?, ?, 'earned', 'webinar_registration', 'Bonus for confirming webinar participation', datetime('now'))`
		).bind(dbUserId, CONFIRM_PARTICIPATION_BONUS_COINS).run();

		// 3. Update balance
		await env.DB.prepare(
			`UPDATE users SET ai_coins_balance = ai_coins_balance + ? WHERE id = ?`
		).bind(CONFIRM_PARTICIPATION_BONUS_COINS, dbUserId).run();

		const newBalance = Number(userRow.ai_coins_balance ?? 0) + CONFIRM_PARTICIPATION_BONUS_COINS;

		// 4. Send photo
		await sendVkMessage(token, {
			peer_id: String(peerId),
			attachment: CONFIRM_PHOTO_ATTACHMENT,
			random_id: String(Date.now() % 2147483647),
		});

		// 5. Send congratulations text with 3 buttons
		const messageText = `🎉 ПОЗДРАВЛЯЮ! ВЫ В СПИСКЕ УЧАСТНИКОВ!

✅ Регистрация пройдена.
💰 Твой баланс: ${newBalance} AI-Coins (Вы сможешь обменять их на скидку или бонусы).

📲 Что дальше:
Ссылку на вход я пришлю в этот чат:
- в день эфира утром
- за 1 час до старта.

🔥 А ТЕПЕРЬ - ГЛАВНЫЙ БОНУС!
Я открыл Вам доступ в Закрытый канал, где уже лежит самая полезная информация.

👇 Вступайте прямо сейчас, пока ссылка активна`;

		const keyboard = {
			inline: true,
			buttons: [
				[
					{
						action: {
							type: "open_link",
							label: "🤫 Тайный чат",
							link: SECRET_CHAT_URL,
						},
						color: "positive",
					},
				],
				[
					{
						action: {
							type: "open_link",
							label: "💬 Обратиться в поддержку",
							link: SUPPORT_URL,
						},
						color: "secondary",
					},
				],
				[
					{
						action: {
							type: "text",
							label: "👤 Информация о спикере",
							payload: JSON.stringify({ command: SPEAKER_INFO_COMMAND }),
						},
						color: "primary",
					},
				],
			],
		};

		await sendVkMessage(token, {
			peer_id: String(peerId),
			message: messageText,
			keyboard: JSON.stringify(keyboard),
			random_id: String((Date.now() + 1) % 2147483647),
		});

		console.log("Confirm participation handler completed:", {
			vkId,
			dbUserId,
			webinarId,
			newBalance,
		});

		return { success: true };

	} catch (error) {
		console.error("Error in handlePersonalConfirmParticipation:", error);
		throw error;
	}
}