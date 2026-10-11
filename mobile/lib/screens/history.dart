import 'package:flutter/material.dart';

import '../i18n.dart';
import '../models.dart';
import '../store.dart';
import '../theme.dart';

String _date(String iso) {
  final d = DateTime.parse(iso).toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)}/${d.year} ${two(d.hour)}:${two(d.minute)}';
}

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, required this.store, required this.language, required this.onOpen, this.onDeleted});

  final Store store;
  final String language;
  final void Function(Conversation) onOpen;
  final void Function(String id)? onDeleted;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  late var items = widget.store.loadConversations();
  String error = '';

  String tr(String key) => t(key, widget.language);

  Future<void> delete(Conversation c) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr('Xóa cuộc trò chuyện này?')),
        content: Text('${c.profile.partnerName} · ${c.turns.first.text}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(tr('Hủy'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(tr('Xóa cuộc này'))),
        ],
      ),
    );
    if (yes != true) return;
    final ok = await widget.store.deleteConversation(c.id);
    if (!mounted) return;
    setState(() {
      error = ok ? '' : tr('Không lưu được. Phiên vẫn còn; hãy thử lưu lại trước khi đóng trang.');
      if (ok) items = widget.store.loadConversations();
    });
    if (ok) widget.onDeleted?.call(c.id);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(tr('Lịch sử trên thiết bị'))),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          tr('Lịch sử chỉ lưu trên thiết bị này; người dùng chung máy có thể xem. Xóa app sẽ mất lịch sử.'),
          style: const TextStyle(color: AppColors.muted),
        ),
        if (error.isNotEmpty) Text(error, style: const TextStyle(color: AppColors.danger)),
        const SizedBox(height: 8),
        if (items.isEmpty) Text(tr('Chưa có lịch sử đã lưu.')),
        for (final c in items)
          Card(
            child: ListTile(
              title: Text('${c.profile.partnerName} · ${c.profile.language} · ${c.turns.length} ${tr('Lượt')}'),
              subtitle: Text(
                '${c.turns.first.text.length > 60 ? '${c.turns.first.text.substring(0, 60)}…' : c.turns.first.text}\n'
                '${_date(c.turns.first.createdAt)}',
              ),
              isThreeLine: true,
              onTap: () => widget.onOpen(c),
              trailing: IconButton(
                tooltip: tr('Xóa cuộc này'),
                icon: const Icon(Icons.delete_outline),
                onPressed: () => delete(c),
              ),
            ),
          ),
      ],
    ),
  );
}
