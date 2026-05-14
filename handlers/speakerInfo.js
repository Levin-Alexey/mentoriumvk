export const SPEAKER_INFO_COMMAND = "speaker_info";

export async function handleSpeakerInfo({ env, userId, peerId, payload }) {
	console.log("Speaker info handler placeholder:", JSON.stringify({
		envConfigured: Boolean(env?.SK),
		userId,
		peerId,
		payload,
	}));
}
