# وثيقة تصميم المنصة (Architecture)

هذه الوثيقة تلخص المراجعة التي سبقت التنفيذ: الصفحات، رحلات المستخدمين، تصميم قاعدة البيانات،
خوارزمية احتساب الجولة والكشف، والحالات الاستثنائية. الكود والمخطط الفعلي في `supabase/migrations`
يطابق ما هو موصوف هنا.

> ملاحظة تسمية: الأسماء التقنية (جداول قاعدة البيانات، الحقول، المسارات) بالإنجليزية لأنها كود، لكن كل
> ما يراه المستخدم (نصوص الواجهة، أسماء المنافسة، المصطلحات) عربي بالكامل وقابل للتعديل من الإعدادات.
> **لا يوجد أي استخدام لاسم "أبو ملقاط"** في الكود أو النصوص — كل تسمية مرتبطة بالمنافسة تُقرأ من جدول `stages`.

## 1. المفاهيم الأساسية

- **Stage (مرحلة/منافسة)**: كيان معزول بالكامل (طلاب، أسئلة، جولات، هوية بصرية، إعدادات). المنصة تدعم عدد
  غير محدود من المراحل تعمل بالتوازي.
- **Profile**: صف واحد لكل مستخدم (نظام مصادقة موحّد)، بدور `system_admin` أو `stage_admin` أو `student`.
- **Round (جولة)**: سؤال واحد + نافذة زمنية + عدد محاولات كشف مسموح بها.
- **Submission**: تسليم الطالب لإجابة الجولة (إجابة واحدة لكل طالب لكل جولة، إلا إذا سمح المشرف بالتعديل).
- **Reveal attempt (محاولة كشف)**: محاولة طالب تخمين الاسم الحقيقي وراء اسم مستعار، مرتبطة بتسليم جولة معيّنة.
- **Balance ledger**: سجل حركات كل رصيد (لا نعدّل `balance` مباشرة بدون قيد في السجل).

## 2. الصفحات الرئيسية

### طالب
1. `/[stage]/register` — التسجيل.
2. `/[stage]/pending` — بانتظار اعتماد المشرف.
3. `/[stage]/login` — الدخول (اسم مستخدم أو جوال + كلمة مرور).
4. `/[stage]` — الرئيسية: البطاقة، الرصيد، الترتيب، الحالة، الجولة الحالية، المؤقت، الإشعارات.
5. `/[stage]/round` — دخول الجولة: السؤال ثم لوحة الكشف ثم المراجعة والتسليم.
6. `/[stage]/leaderboard` — شبكة بطاقات المتنافسين (Who Is It؟).
7. `/[stage]/history` — سجل الرصيد والنتائج السابقة.

### شاشة عرض جماعية
8. `/[stage]/display` — وضع ملء شاشة للبروجكتر/التلفزيون، بيانات عامة فقط، تحديث فوري.

### إدارة
9. `/[stage]/admin` — نظرة عامة.
10. `/[stage]/admin/players` — إدارة اللاعبين والاعتماد.
11. `/[stage]/admin/rounds` — الأسئلة والجولات (CRUD + جدولة).
12. `/[stage]/admin/rounds/[id]` — تحكم الجولة: فتح/إغلاق/تمديد/احتساب/معاينة/نشر/تراجع، قوائم الإجابات ومحاولات الكشف.
13. `/[stage]/admin/settings` — الهوية البصرية، المصطلحات، الأعلام (feature flags)، صلاحيات الكشف والتعديل.
14. `/admin/system` — لوحة مسؤول النظام: إنشاء/إدارة المراحل، مشرفوها، سجل العمليات.

## 3. رحلات المستخدمين

**الطالب**: تسجيل → بانتظار الاعتماد → اعتماد (إشعار) → دخول → الرئيسية → دخول الجولة (إجابة + كشف اختياري)
→ تسليم (رسالة استلام فقط، بدون نتيجة) → (بعد الاحتساب والنشر) إشعارات نتائج + تحديث فوري للرصيد/الترتيب/الحالة
→ يتكرر لكل جولة حتى الانكشاف أو نهاية المنافسة.

**مشرف المرحلة**: يرفع الأسئلة ويجدول الجولات → يراقب التسليمات أثناء الفتح → يغلق (يدويًا أو تلقائيًا حسب
الجدولة) → يضغط "احتساب" → يراجع المعاينة → يضغط "نشر" في اللحظة المناسبة → يتابع اللاعبين والبطاقات.

**مسؤول النظام**: ينشئ مرحلة جديدة (slug + هوية بصرية أولية) → يعيّن مشرف المرحلة → يراقب كل المراحل من لوحة
واحدة دون رؤية تفاصيل حسّاسة داخل كل مرحلة أكثر مما يحتاج.

## 4. تصميم قاعدة البيانات (ملخص، التفاصيل الكاملة في migrations)

```
stages
  id, slug (unique), name, logo_url, colors jsonb, terminology jsonb,
  registration_open, auto_approve, starting_balance, show_leaderboard, show_balances,
  enable_risk_indicator, enable_most_wanted, enable_badges, enable_streak, enable_sound_fx,
  default_reveal_attempts, allow_answer_edit, results_publish_mode ('manual'|'auto'), created_at

profiles (id = auth.users.id)
  role ('system_admin'|'stage_admin'|'student'), stage_id (null for system_admin),
  real_name, display_name, phone, username (unique per stage), emoji, extra_fields jsonb,
  status ('pending'|'approved'|'rejected'|'suspended'|'excluded'|'active'|'exposed'),
  balance, exposed_by, exposed_round_id, approved_at, last_login_at, created_at
  UNIQUE(stage_id, phone), UNIQUE(stage_id, username), UNIQUE(stage_id, display_name)

rounds
  id, stage_id, round_number, title, question, options jsonb, correct_option,
  points, reveal_attempts_allowed, reveal_enabled, opens_at, closes_at,
  publish_mode, results_published_at, open_message, closing_soon_message, post_submit_message,
  attachment_url, status ('draft'|'scheduled'|'open'|'closed'|'calculating'|'calculated'|'published'),
  calculated_at, created_at
  UNIQUE(stage_id, round_number)

submissions
  id, round_id, student_id, selected_option, is_correct, points_awarded,
  submitted_at (server default now()), edited_at
  UNIQUE(round_id, student_id)

reveal_attempts
  id, round_id, submission_id, revealer_id, target_id, guessed_real_name,
  is_correct, status ('pending'|'executed'|'wrong_guess'|'cancelled_wrong_answer'|
    'cancelled_target_exposed'|'cancelled_revealer_exposed'|'cancelled_admin'),
  cancel_reason, attempt_index, sequence_in_round, submitted_at, processed_at
  CHECK(revealer_id <> target_id)

balance_ledger
  id, stage_id, student_id, round_id, type ('correct_answer'|'reveal_gain'|'admin_adjustment'|'exposed_reset'),
  amount, balance_before, balance_after, reason, created_by, created_at

badges, student_badges — تعريف/منح الأوسمة لكل مرحلة
notifications — stage_id, student_id (null = بث عام), type, title, body, data jsonb, read_at
events_log — تغذية الأحداث العامة لسجل الأحداث المباشر وشاشة العرض
admin_audit_log — كل عملية إدارية حساسة (اعتماد، تعديل رصيد، كشف إداري...) لأغراض المراجعة
```

الفهرسة والعزل: كل جدول عملياتي فيه `stage_id`، وسياسات RLS تربط كل قراءة/كتابة بـ
`stage_id` الخاص بالمستخدم (أو بامتياز system_admin). لا يمكن لأي استعلام عبر PostgREST تجاوز هذا العزل.

## 5. خوارزمية احتساب الجولة (`calculate_round`)

تُنفَّذ كدالة PL/pgSQL واحدة داخل معاملة (transaction) واحدة، تُقفل صف الجولة بـ`FOR UPDATE` وتمنع التنفيذ
المزدوج (`status` يجب أن يكون `closed`؛ تتحول فورًا إلى `calculating`).

1. **تصحيح الإجابات**: لكل `submission` في الجولة: `is_correct = selected_option = correct_option`،
   `points_awarded = is_correct ? round.points : 0`. عند الصحة: قيد في `balance_ledger` (`correct_answer`)
   وتحديث `profiles.balance`.
2. **إلغاء محاولات أصحاب الإجابات الخاطئة**: كل `reveal_attempts` تخص `submission` غير صحيحة →
   `status = cancelled_wrong_answer` مباشرة، بغض النظر عن صحة التخمين.
3. **الترتيب**: تُجلب بقية المحاولات (`pending`) مرتّبة بـ`submitted_at` ثم `id` (فاصل حتمي عند تطابق الوقت)
   — وقت الخادم فقط.
4. **تنفيذ تسلسلي بحلقة `FOR`** (لأن كل خطوة قد تغيّر حالة الأهداف/الكاشفين للخطوات التالية):
   لكل محاولة بالترتيب:
   - إن كان الهدف مكشوفًا بالفعل (من محاولة أسبق في نفس الحلقة أو من جولة سابقة) →
     `cancelled_target_exposed`.
   - إن كان الكاشف نفسه أصبح مكشوفًا أثناء هذه الحلقة (كُشف كهدف بمحاولة أسبق) →
     `cancelled_revealer_exposed`.
   - غير ذلك: `is_correct = guessed_real_name = target.real_name`.
     - **صحيح** → تنفيذ الكشف: تحويل كامل رصيد الهدف الحالي إلى الكاشف، تصفير رصيد الهدف،
       `target.status = exposed` مع `exposed_by` و`exposed_round_id`، قيدان في `balance_ledger`
       (`exposed_reset` للهدف، `reveal_gain` للكاشف)، `status = executed`.
     - **خطأ** → `status = wrong_guess` (بدون أي أثر على الأرصدة).
5. حفظ النتيجة في وضع **معاينة** (`round.status = calculated`) — لا إشعارات ولا ظهور للطلاب بعد.
6. **النشر منفصل تمامًا** (`publish_round`): يتحقق أن `status = calculated`، يضبط `results_published_at`،
   `status = published`، يكتب أحداثًا في `events_log` وإشعارات لكل طالب متأثر.
7. **التراجع** (`undo_calculation`): مسموح فقط إن `status != published`. يعكس كل قيود `balance_ledger`
   الخاصة بهذه الجولة (`amount` بالسالب)، يعيد `profiles.balance`/`status`/`exposed_by` لحالتها السابقة عبر
   إعادة تشغيل القيود بالعكس، يعيد كل `reveal_attempts` و`submissions` إلى `pending`/غير مصححة،
   `round.status = closed`. يمكن بعدها **إعادة الاحتساب** من جديد.
8. **منع التكرار**: الانتقال من `closed → calculating → calculated` ذرّي بفضل `FOR UPDATE`؛ استدعاء الدالة
   على جولة ليست `closed` يفشل فورًا (`RAISE EXCEPTION`).

## 6. قواعد التعارض والحالات الاستثنائية (منطبّقة داخل نفس الدالة)

- إجابة خاطئة ⇒ تُلغى كل محاولات الكشف المرتبطة بها، حتى لو كان التخمين صحيحًا.
- تطابق وقت التسليم: الفرز الثانوي بـ`id` يضمن ترتيبًا حتميًا لا يعتمد على تفاصيل تنفيذ إضافية.
- هدف مشترك بين عدة كاشفين: أول محاولة صحيحة زمنيًا تُنفَّذ فتُصبح الحالة `exposed`؛ كل محاولة لاحقة على
  نفس الهدف (من أي كاشف) تُلغى بـ`cancelled_target_exposed` تلقائيًا بمجرد وصول الحلقة إليها.
- كشف متبادل بنفس الجولة (A يستهدف B وB يستهدف A): يُنفَّذ صاحب التسليم الأسبق، والآخر يُلغى بـ
  `cancelled_revealer_exposed` عند وصول دوره لأن هدفه (والمنفّذ الفعلي) أصبح يعرف أنه — بل الأهم أن **الكاشف نفسه**
  أصبح مكشوفًا فتُلغى محاولته بصرف النظر عن صحة تخمينه.
- لا يمكن للطالب استهداف نفسه (قيد `CHECK` في القاعدة + تحقق في واجهة الكشف).
- لا يمكن استهداف لاعب مكشوف من قبل: يُمنع عند التسليم (لا تظهر بطاقته في قائمة الأهداف المتاحة) وأيضًا
  كطبقة حماية ثانية أثناء الاحتساب.
- تكرار التسليم بنفس الجولة: مرفوض ما لم يفعّل المشرف `allow_answer_edit` على مستوى المرحلة/الجولة، وعندها
  يُستبدل التسليم القديم بالكامل (بما فيه محاولات الكشف) ويُعاد ختمه بوقت خادم جديد.
- كل الأوقات (`opens_at`, `closes_at`, `submitted_at`) بمرجعية خادم قاعدة البيانات (`now()`)، لا تُقبل أي
  طوابع زمنية من المتصفح.
- تشغيل الاحتساب مرتين: مرفوض بقفل الحالة (`closed` فقط)؛ يجب المرور بـ`undo_calculation` أولًا لإعادة
  الفتح للاحتساب.
- طالب مستبعد/موقوف: يُستثنى من نافذة الأسئلة والكشف الجديد، ولا يظهر كهدف صالح.

## 7. النطاق المُنفَّذ في هذه النسخة مقابل خارطة الطريق

منفَّذ فعليًا (قاعدة بيانات حقيقية + صلاحيات + تحديث فوري، وليس واجهات وهمية):
تسجيل/اعتماد/دخول، رئيسية الطالب، دخول الجولة + الكشف + التسليم، لوحة المتنافسين وشاشة العرض بالتحديث
الفوري، لوحة تحكم المشرف (لاعبون/جولات/تحكم الجولة بالكامل بما فيها الاحتساب والنشر والتراجع)، الإعدادات
والهوية البصرية لكل مرحلة، مسؤول النظام متعدد المراحل، سجل الأحداث والإشعارات الأساسية.

خارطة طريق موثّقة (غير منفّذة في هذه الدفعة، مكانها محجوز في المخطط): مؤثرات صوتية فعلية، مؤشر الخطر
والأكثر طلبًا كحسابات مباشرة تراكمية، منح الأوسمة تلقائيًا، سلسلة الإجابات المتتالية، تكامل CI/CD فعلي مع
حسابات GitHub/Supabase/Vercel الحقيقية للمستخدم (يتطلب بياناته الخاصة — راجع `README.md`).
