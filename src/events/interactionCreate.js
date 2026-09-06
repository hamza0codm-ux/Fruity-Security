import {
    handleSecurityAction,
} from '../interactions/security_action.js';

export function registerInteractionEvents(client) {
    client.on(
        'interactionCreate',
        async (interaction) => {
            try {
                if (interaction.isButton()) {
                    const handled =
                        await handleSecurityAction(
                            interaction,
                        );

                    if (handled) {
                        return;
                    }
                }
            } catch (error) {
                console.error(
                    'Interaction error:',
                    error,
                );

                if (
                    interaction.isRepliable() &&
                    !interaction.replied &&
                    !interaction.deferred
                ) {
                    await interaction.reply({
                        content:
                            '❌ Something went wrong.',
                        ephemeral: true,
                    });
                }
            }
        },
    );
}
