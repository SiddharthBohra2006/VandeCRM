const plain = item => item.toObject ? item.toObject() : item;

function clientTimeline(activities, workHistory, attachments, customerId) {
  const uploadNotes = new Set();
  const files = attachments.map(file => {
    const note = activities.find(activity => activity.note === `Attachment uploaded: ${file.originalName}.` && Math.abs(new Date(activity.createdAt) - new Date(file.createdAt)) < 60000);
    if (note) uploadNotes.add(String(note._id));
    return { _id: file._id, timelineType: 'attachment', type: 'file_uploaded', user: file.uploadedBy, createdAt: file.createdAt,
      message: `Uploaded ${file.originalName}${file.notes ? ': ' + file.notes : ''}`, href: `/customers/${customerId}/attachments/${file._id}/download` };
  });
  return [
    ...activities.filter(item => !uploadNotes.has(String(item._id))).map(item => ({ ...plain(item), timelineType: 'activity', message: item.note })),
    ...workHistory.map(item => ({ ...plain(item), timelineType: 'work' })),
    ...files
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = { clientTimeline };
