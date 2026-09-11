const notEnabled = async () => {
    const error = new Error('Provider chưa bật');
    error.status = 400;
    error.clearFailure = true;
    throw error;
};

module.exports = {
    createPayment: notEnabled,
    queryPayment: notEnabled,
    verifyCallback: () => ({ ok: false, reason: 'Provider chưa bật' })
};
